-- ============================================================
-- Chat system — matches / conversations / messages
-- ============================================================
-- Authoritative source: docs/chat-spec/DEV-SPEC.md
--   - CH-API1  POST /conversations/:id/messages  (insert, status=SENT)
--   - CH-API2  POST /conversations/:id/leave     (DELETED + soft-delete + UNMATCHED)
--   - CH-RT    realtime: message_received / conversation_ended_received
--   - CH0      blocks 양방향 + conversations.status 게이트
--   - B-CH1 / B-CH2 / B-CH5 business policies
--
-- User identity is auth.users(id) — consistent with existing
-- public.blocks / public.likes / public.private_profiles.
--
-- DDL checklist (each item consciously applied):
--   PK            : Y  (uuid pk default gen_random_uuid())
--   NOT NULL      : Y  (all user/fk/status/body columns)
--   인덱스         : Y  (conversation_id, updated_at desc, participant lookups)
--   FK            : Y  (auth.users, matches, conversations — on delete cascade)
--   DEFAULT       : Y  (status, timestamps, deleted_at null)
--   타입·길이      : Y  (uuid / text+check enum / timestamptz / body 1..500)
--   네이밍 일관성   : Y  (*_user_id, status, created_at, updated_at — blocks 패턴)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- matches (확장 — 기존 테이블 재사용) ----------
-- public.matches 는 likes/매칭 파이프라인(20260514000020_create_matches.sql)
-- 에서 이미 생성된다. 그 테이블에는 채팅이 필요로 하는
-- status / matched_at / updated_at 컬럼이 없으므로 *추가만* 한다.
-- (테이블을 재정의하지 않음 — 다른 작업자 마이그레이션과 충돌·소유권 침범 방지)
--
-- 양쪽 좋아요 성립 시 ACTIVE. 채팅방 나가기 시 UNMATCHED.
create table if not exists public.matches (
  id              uuid primary key default gen_random_uuid(),
  user_a_id       uuid not null references auth.users(id) on delete cascade,
  user_b_id       uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- 채팅 도메인이 요구하는 컬럼을 멱등하게 보강.
alter table public.matches
  add column if not exists status text not null default 'ACTIVE';
alter table public.matches
  add column if not exists matched_at timestamptz not null default now();
alter table public.matches
  add column if not exists updated_at timestamptz not null default now();

-- status 도메인 제약 (이미 있으면 skip).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_status_chk'
  ) then
    alter table public.matches
      add constraint matches_status_chk
      check (status in ('ACTIVE', 'UNMATCHED'));
  end if;
end $$;

-- 동일 사용자 쌍 1건만 (canonical order 가정).
create unique index if not exists matches_pair_unique
  on public.matches(user_a_id, user_b_id);
-- status 컬럼 확보 후 부분 인덱스 생성 (42703 회피).
create index if not exists matches_status_user_a_idx
  on public.matches(user_a_id) where status = 'ACTIVE';
create index if not exists matches_status_user_b_idx
  on public.matches(user_b_id) where status = 'ACTIVE';

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------- conversations ----------
-- 매칭당 1:1 대화방. CH0 게이트가 status 로 분기.
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null unique references public.matches(id) on delete cascade,
  user_a_id       uuid not null references auth.users(id) on delete cascade,
  user_b_id       uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'ACTIVE'
                    check (status in ('ACTIVE', 'ENDED', 'DELETED')),
  last_message_preview text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint conversations_no_self check (user_a_id <> user_b_id),
  constraint conversations_canonical_order check (user_a_id < user_b_id),
  constraint conversations_preview_length
    check (last_message_preview is null or char_length(last_message_preview) <= 500)
);

-- CH1 목록: 참여자별 updated_at 내림차순 정렬 (스펙 4. 10-B)
create index if not exists conversations_user_a_idx
  on public.conversations(user_a_id, updated_at desc);
create index if not exists conversations_user_b_idx
  on public.conversations(user_b_id, updated_at desc);
create index if not exists conversations_status_idx
  on public.conversations(status);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------- messages ----------
-- 메시지 1건. body 1~500자. soft-delete (deleted_at).
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id  uuid not null references auth.users(id) on delete cascade,
  body            text not null,
  status          text not null default 'SENT'
                    check (status in ('SENT')),
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint messages_body_length
    check (char_length(body) between 1 and 500)
);

-- 채팅방 스트림 조회: conversation_id + 시간순. 미삭제만.
create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at)
  where deleted_at is null;
-- realtime / 전체 conversation 단위 조회.
create index if not exists messages_conversation_all_idx
  on public.messages(conversation_id);
create index if not exists messages_sender_idx
  on public.messages(sender_user_id);

-- ============================================================
-- Helper: 두 사용자 간 양방향 차단 여부 (B-CH1 / B-CH2)
--   blocker ∈ {a,b} AND blockee ∈ {a,b} AND 아직 미해제
-- security definer — RLS 우회하여 상대의 차단행도 평가.
-- ============================================================
create or replace function public.chat_is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.blocks b
     where b.unblocked_at is null
       and (
         (b.blocker_user_id = p_user_a and b.blocked_user_id = p_user_b)
         or
         (b.blocker_user_id = p_user_b and b.blocked_user_id = p_user_a)
       )
  );
$$;

-- ============================================================
-- RLS — 참여자만 + 차단 양방향 시 차단
-- ============================================================
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ---------- matches RLS ----------
drop policy if exists "matches_select_participant_or_admin" on public.matches;
create policy "matches_select_participant_or_admin"
  on public.matches for select to authenticated
  using (
    user_a_id = auth.uid()
    or user_b_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "matches_admin_all" on public.matches;
create policy "matches_admin_all"
  on public.matches for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- conversations RLS ----------
-- 참여자이고, 양방향 차단이 없을 때만 SELECT (B-CH1).
drop policy if exists "conversations_select_participant_unblocked" on public.conversations;
create policy "conversations_select_participant_unblocked"
  on public.conversations for select to authenticated
  using (
    (
      (user_a_id = auth.uid() or user_b_id = auth.uid())
      and not public.chat_is_blocked_between(user_a_id, user_b_id)
    )
    or public.is_admin()
  );

drop policy if exists "conversations_admin_all" on public.conversations;
create policy "conversations_admin_all"
  on public.conversations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- messages RLS ----------
-- 참여 대화의 미삭제 메시지만, 차단 없을 때만 SELECT.
drop policy if exists "messages_select_participant_unblocked" on public.messages;
create policy "messages_select_participant_unblocked"
  on public.messages for select to authenticated
  using (
    public.is_admin()
    or (
      deleted_at is null
      and exists (
        select 1
          from public.conversations c
         where c.id = messages.conversation_id
           and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
           and not public.chat_is_blocked_between(c.user_a_id, c.user_b_id)
      )
    )
  );

-- INSERT: 본인이 보낸 메시지 + conversation ACTIVE + 참여자 + 미차단 (B-CH2).
-- 서버(service-role)는 RLS 우회하므로 이 정책은 클라이언트 직접 insert 방어선.
drop policy if exists "messages_insert_participant_active_unblocked" on public.messages;
create policy "messages_insert_participant_active_unblocked"
  on public.messages for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and deleted_at is null
    and status = 'SENT'
    and exists (
      select 1
        from public.conversations c
       where c.id = messages.conversation_id
         and c.status = 'ACTIVE'
         and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
         and not public.chat_is_blocked_between(c.user_a_id, c.user_b_id)
    )
  );

drop policy if exists "messages_admin_all" on public.messages;
create policy "messages_admin_all"
  on public.messages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Realtime — CH-RT: message_received / conversation_ended_received
-- ============================================================
-- supabase_realtime publication 에 추가. (이미 있으면 무시)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- conversations: status 변경(ENDED/DELETED) → conversation_ended_received
    begin
      alter publication supabase_realtime add table public.conversations;
    exception when duplicate_object then null;
    end;
    -- messages: insert → message_received
    begin
      alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Realtime UPDATE/DELETE payload 에 이전 값(old) 포함 — 상대가 본인 행 필터링 가능.
alter table public.conversations replica identity full;
alter table public.messages replica identity full;

-- ============================================================
-- RPC: 채팅방 나가기 (CH-API2 / B-CH5)
--   conversation.status=DELETED, messages soft-delete,
--   matches.status=UNMATCHED. 호출자는 참여자여야 함.
--   security definer — 양쪽 모두 정리 (한쪽 보존 비대칭 없음).
-- ============================================================
create or replace function public.leave_conversation(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  match_id uuid,
  other_user_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_conv
    from public.conversations
   where id = p_conversation_id
   for update;

  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.user_a_id <> v_caller and v_conv.user_b_id <> v_caller then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  v_other := case
    when v_conv.user_a_id = v_caller then v_conv.user_b_id
    else v_conv.user_a_id
  end;

  -- 1) conversation -> DELETED
  --    OUT 파라미터 `status` 와 테이블 컬럼 `status` 모호성(42702) 방지:
  --    set 대상은 테이블 별칭으로 한정.
  update public.conversations as c
     set status = 'DELETED',
         updated_at = now()
   where c.id = p_conversation_id;

  -- 2) messages soft-delete (전체)
  update public.messages as m
     set deleted_at = now()
   where m.conversation_id = p_conversation_id
     and m.deleted_at is null;

  -- 3) matches -> UNMATCHED
  update public.matches as mt
     set status = 'UNMATCHED',
         updated_at = now()
   where mt.id = v_conv.match_id
     and mt.status <> 'UNMATCHED';

  -- OUT 컬럼명과 동일한 식별자 충돌 방지: 명시적 별칭 부여.
  return query
    select p_conversation_id   as conversation_id,
           v_conv.match_id     as match_id,
           v_other             as other_user_id,
           'DELETED'::text     as status;
end $$;

revoke all on function public.leave_conversation(uuid) from public;
grant execute on function public.leave_conversation(uuid) to authenticated;

-- ============================================================
-- RPC: 메시지 전송 (CH-API1 / B-CH2)
--   서버측 차단/conversation 상태 재검증 후 insert (status=SENT).
--   security definer — race 방지 위해 단일 트랜잭션에서 재검증+insert.
--   conversations.last_message_* / updated_at 갱신 (CH1 정렬).
-- ============================================================
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_user_id uuid,
  body text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_conv public.conversations;
  v_body text := p_body;
  v_msg public.messages;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'message body must be 1..500 chars' using errcode = '22023';
  end if;

  select * into v_conv
    from public.conversations
   where conversations.id = p_conversation_id
   for share;

  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.user_a_id <> v_caller and v_conv.user_b_id <> v_caller then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  -- 전송 직전 재검증 (B-CH2)
  if v_conv.status <> 'ACTIVE' then
    raise exception 'conversation is not active' using errcode = 'P0001';
  end if;

  if public.chat_is_blocked_between(v_conv.user_a_id, v_conv.user_b_id) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_user_id, body, status)
  values (p_conversation_id, v_caller, v_body, 'SENT')
  returning * into v_msg;

  update public.conversations
     set last_message_preview = left(v_body, 200),
         last_message_at = v_msg.created_at,
         updated_at = now()
   where conversations.id = p_conversation_id;

  return query
    select v_msg.id, v_msg.conversation_id, v_msg.sender_user_id,
           v_msg.body, v_msg.status, v_msg.created_at;
end $$;

revoke all on function public.send_message(uuid, text) from public;
grant execute on function public.send_message(uuid, text) to authenticated;

-- ============================================================
-- Helper RPC: 매칭 성립 → conversation 생성 (테스트/매칭 파이프라인용)
--   user pair 정규화(canonical order) + 멱등.
-- ============================================================
create or replace function public.ensure_conversation_for_match(
  p_user_x uuid,
  p_user_y uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid := least(p_user_x, p_user_y);
  v_b uuid := greatest(p_user_x, p_user_y);
  v_match_id uuid;
  v_conv_id uuid;
begin
  if v_a = v_b then
    raise exception 'cannot match a user with themselves' using errcode = '22023';
  end if;

  insert into public.matches (user_a_id, user_b_id, status)
  values (v_a, v_b, 'ACTIVE')
  on conflict (user_a_id, user_b_id)
  do update set status = 'ACTIVE', updated_at = now()
  returning id into v_match_id;

  insert into public.conversations (match_id, user_a_id, user_b_id, status)
  values (v_match_id, v_a, v_b, 'ACTIVE')
  on conflict (match_id)
  do update set status = case
       when conversations.status = 'DELETED' then 'DELETED'
       else 'ACTIVE'
     end
  returning id into v_conv_id;

  return v_conv_id;
end $$;

revoke all on function public.ensure_conversation_for_match(uuid, uuid) from public;
grant execute on function public.ensure_conversation_for_match(uuid, uuid) to service_role;

-- Phase 4 (2/2) — rooms v2 베이스라인 (A 골격, zero-base).
--
-- 새 도메인: 그룹 소개팅(과팅) / 방 / 매시간 3초 영상 / 단체 채팅(+@멘션 귓속말).
-- 네이밍 = A 골격 (team / group_match / room_member). DM(1:1) 은 범위 밖(미구현).
--
-- 설계 SSOT: docs/superpowers/specs/2026-05-29-dei-1차-셋팅-핸드오프-design.md §5
-- 거버넌스(A 고정): PK uuid / FK cascade / status text+check / RLS=room_is_member
--   단일 게이트 / 상태전이는 RPC·Edge / realtime=room·room_member·message.
--
-- 이 베이스라인은 골격이다 — 세부 컬럼은 각 작업자(A/B/C)가 디벨롭한다.
-- 🔴 공유 핵심 테이블(profile/room/room_member/group_match/message)의 스키마
--    변경은 A 거버넌스(충돌 방지). 헤더 주석의 작업자 표기 참조.

-- ════════════════════════════════════════════════════════════════════════════
-- 0) 공통 헬퍼 (재사용 — 신규 생성 금지 대상이지만 zero-base 라 새로 정의)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 관리자 판별 (Admin 화면은 이번 범위 밖이나 RLS 우회용 골격)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (raw_app_meta_data ->> 'role') = 'admin'
     from auth.users where id = auth.uid()),
    false
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) profile (🔴 공유, A 거버넌스) — auth.users 1:1
--    작업자: A·B·C 전부 R / 온보딩(B) W. 스키마 변경은 A 승인.
-- ════════════════════════════════════════════════════════════════════════════
create table public.profile (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nickname     text,
  nickname_lower text generated always as (lower(nickname)) stored,
  gender       text check (gender in ('male','female')),        -- 본인인증 결과(lock)
  birth_year   smallint,                                         -- 본인인증 결과(lock)
  region       text,
  photo_url    text,
  bio          text,
  is_adult     boolean not null default false,                   -- PortOne 19+ 통과
  -- 새벽 알림 차단(L2 정책 0~7 KST 기본)
  quiet_hours_start smallint not null default 0 check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint not null default 7 check (quiet_hours_end between 0 and 23),
  -- 방 가용성 캐시 (매칭 충돌 방지)
  is_in_active_room boolean not null default false,
  last_room_leave_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index profile_nickname_lower_uniq
  on public.profile(nickname_lower) where nickname_lower is not null;
create trigger profile_set_updated_at before update on public.profile
  for each row execute function public.set_updated_at();

-- 가입 시 profile 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- 2) auth_verification (A) — 본인인증(PortOne) 결과
-- ════════════════════════════════════════════════════════════════════════════
create table public.auth_verification (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null default 'portone',
  status      text not null check (status in ('pending','verified','failed')) default 'pending',
  ci_hash     text,    -- 중복 가입 판별용 해시 (평문 CI 저장 금지)
  di_hash     text,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index auth_verification_user_idx on public.auth_verification(user_id);
create unique index auth_verification_ci_uniq on public.auth_verification(ci_hash)
  where ci_hash is not null and status = 'verified';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) team (A W / B R) — 과팅 참가 묶음 (혼자=size1 허용)
-- ════════════════════════════════════════════════════════════════════════════
create table public.team (
  id           uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name         text,
  gender       text check (gender in ('male','female')),  -- 팀 성별(반대 성별 팀과 매칭)
  target_size  smallint not null default 1 check (target_size between 1 and 4),
  status       text not null check (status in ('forming','ready','matching','locked','disbanded')) default 'forming',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  disbanded_at timestamptz
);
create index team_owner_status_idx on public.team(owner_user_id, status);
create trigger team_set_updated_at before update on public.team
  for each row execute function public.set_updated_at();

-- team_member (팀 확정 인원 — team_invite ACCEPTED 의 정규화 테이블)
create table public.team_member (
  team_id    uuid not null references public.team(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','member')) default 'member',
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_member_user_idx on public.team_member(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) team_invite (A W / B R) — 닉네임 초대
-- ════════════════════════════════════════════════════════════════════════════
create table public.team_invite (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.team(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  status        text not null check (status in ('pending','accepted','declined','expired')) default 'pending',
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index team_invite_team_idx on public.team_invite(team_id);
create index team_invite_invitee_idx on public.team_invite(invitee_user_id) where invitee_user_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) match_queue (B W / C R) — 매칭 대기열 (운영진 수동 편성 MVP)
-- ════════════════════════════════════════════════════════════════════════════
create table public.match_queue (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.team(id) on delete cascade,
  gender      text check (gender in ('male','female')),
  desired_size smallint not null default 1,
  region      text,
  status      text not null check (status in ('waiting','matched','cancelled','expired')) default 'waiting',
  enqueued_at timestamptz not null default now(),
  expires_at  timestamptz,
  matched_at  timestamptz
);
create index match_queue_waiting_idx on public.match_queue(status, gender, enqueued_at)
  where status = 'waiting';

-- ════════════════════════════════════════════════════════════════════════════
-- 8) room (🔴 공유, A 가 RLS 게이트 못박음) — 방
--    먼저 정의해야 group_match/room_member 가 참조 가능
-- ════════════════════════════════════════════════════════════════════════════
create table public.room (
  id           uuid primary key default gen_random_uuid(),
  status       text not null check (status in ('active','ended','deleted')) default 'active',
  member_count smallint not null default 0,
  active_member_count smallint not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),  -- L2 정책 D6
  ended_at     timestamptz,
  ended_reason text check (ended_reason in ('expired','all_left','admin','manual'))
);
create index room_active_idx on public.room(status, expires_at) where status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- 6) group_match (🔴 C 단독 소유) — 두 팀 매칭 1건
-- ════════════════════════════════════════════════════════════════════════════
create table public.group_match (
  id          uuid primary key default gen_random_uuid(),
  team_a_id   uuid not null references public.team(id) on delete cascade,
  team_b_id   uuid not null references public.team(id) on delete cascade,
  room_id     uuid references public.room(id) on delete set null,
  status      text not null check (status in ('active','ended','cancelled')) default 'active',
  matched_at  timestamptz not null default now(),
  check (team_a_id < team_b_id)                    -- canonical order
);
create unique index group_match_pair_uniq on public.group_match(team_a_id, team_b_id)
  where status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- 7) match_member (C W / room R) — 매칭에 속한 사람
-- ════════════════════════════════════════════════════════════════════════════
create table public.match_member (
  match_id uuid not null references public.group_match(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  side     text not null check (side in ('a','b')),
  primary key (match_id, user_id)
);
create index match_member_user_idx on public.match_member(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 9) room_member (🔴 공유, room_is_member 정의 원천) — 방 멤버십
-- ════════════════════════════════════════════════════════════════════════════
create table public.room_member (
  room_id   uuid not null references public.room(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner','member')) default 'member',
  status    text not null check (status in ('active','left','auto_kicked')) default 'active',
  joined_at timestamptz not null default now(),
  left_at   timestamptz,                             -- soft leave
  primary key (room_id, user_id)
);
create index room_member_user_idx on public.room_member(user_id) where status = 'active';

-- 🔴 RLS 단일 게이트: 모든 room 하위 테이블 SELECT 가 이걸 참조
create or replace function public.room_is_member(p_room_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_member rm
    where rm.room_id = p_room_id and rm.user_id = p_user_id and rm.status = 'active'
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10) room_lifecycle (A W) — 방 생성/종료 이벤트 이력
-- ════════════════════════════════════════════════════════════════════════════
create table public.room_lifecycle (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.room(id) on delete cascade,
  event     text not null check (event in ('created','member_joined','member_left','auto_kicked','ended')),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail    jsonb,
  created_at timestamptz not null default now()
);
create index room_lifecycle_room_idx on public.room_lifecycle(room_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 11) video / upload (C W) — 3초 영상 (영상 모듈은 후속 담당, 골격만)
-- ════════════════════════════════════════════════════════════════════════════
create table public.video (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.room(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  thumbnail_path text,
  duration_ms integer,
  hour_slot  smallint,                                -- KST 시간대 슬롯
  status     text not null check (status in ('processing','ready','failed','archived')) default 'processing',
  created_at timestamptz not null default now()
);
create index video_room_idx on public.video(room_id, created_at);
create index video_user_room_idx on public.video(user_id, room_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 12) message (+mention) (🔴 A=방채팅) — 단체 채팅 + @멘션 귓속말
--     DM(1:1) 은 범위 밖. 귓속말은 message 에 whisper_to_user_id 로 표현.
-- ════════════════════════════════════════════════════════════════════════════
create table public.message (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.room(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  whisper_to_user_id uuid references auth.users(id) on delete set null,  -- @멘션 귓속말 대상
  status     text not null check (status in ('sent','deleted')) default 'sent',
  created_at timestamptz not null default now()
);
create index message_room_idx on public.message(room_id, created_at);

create table public.message_mention (
  message_id uuid not null references public.message(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  primary key (message_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 13) block / report (B 접수 / PM 판정) — 안전
-- ════════════════════════════════════════════════════════════════════════════
create table public.block (
  id         uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  room_id    uuid references public.room(id) on delete set null,
  created_at timestamptz not null default now(),
  unblocked_at timestamptz,
  unique (blocker_user_id, blocked_user_id)
);
create index block_blocker_idx on public.block(blocker_user_id) where unblocked_at is null;

-- 양방향 차단 평가 (멤버 pairwise 게이트)
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.block
    where unblocked_at is null
      and ((blocker_user_id = a and blocked_user_id = b)
        or (blocker_user_id = b and blocked_user_id = a))
  );
$$;

create table public.report (
  id         uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  room_id    uuid references public.room(id) on delete set null,
  category   text not null,                            -- L2 정책 6 카테고리
  detail     text,
  status     text not null check (status in ('open','reviewing','resolved','dismissed')) default 'open',
  created_at timestamptz not null default now()
);
create index report_reported_idx on public.report(reported_user_id);
create index report_status_idx on public.report(status) where status in ('open','reviewing');

-- ════════════════════════════════════════════════════════════════════════════
-- 14) payment / pass (B W) — 결제 / 면제권(부스터)
-- ════════════════════════════════════════════════════════════════════════════
create table public.payment (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null default 'revenuecat',
  product_id text,
  amount     integer,
  status     text not null check (status in ('pending','completed','failed','refunded')) default 'pending',
  created_at timestamptz not null default now()
);
create index payment_user_idx on public.payment(user_id, created_at);

create table public.pass (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('booster','rematch')) default 'booster',
  granted    smallint not null default 0,
  remaining  smallint not null default 0,
  status     text not null check (status in ('active','consumed','expired')) default 'active',
  source     text check (source in ('purchase','free_grant')),
  created_at timestamptz not null default now()
);
create index pass_user_active_idx on public.pass(user_id) where status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- 15) notification_setting (B W) — 알림 설정 (알림 모듈은 후속 담당, 골격만)
-- ════════════════════════════════════════════════════════════════════════════
create table public.notification_setting (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  match_alert  boolean not null default true,
  upload_reminder boolean not null default true,
  chat_mention boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger notification_setting_set_updated_at before update on public.notification_setting
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 16) refund_ticket / audit (A/PM) — 운영 (Admin 화면은 범위 밖, 골격만)
-- ════════════════════════════════════════════════════════════════════════════
create table public.refund_ticket (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  payment_id uuid references public.payment(id) on delete set null,
  reason     text,
  status     text not null check (status in ('open','approved','rejected')) default 'open',
  created_at timestamptz not null default now()
);
create index refund_ticket_status_idx on public.refund_ticket(status);

create table public.audit (
  id         uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit(created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- realtime publication (room / room_member / message 만)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.room replica identity full;
alter table public.room_member replica identity full;
alter table public.message replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room;
    alter publication supabase_realtime add table public.room_member;
    alter publication supabase_realtime add table public.message;
  end if;
end $$;

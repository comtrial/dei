-- 20260530000010_rooms_v2_message_dedup_push.sql
-- S13a: message 멱등(client_msg_id) + self-whisper belt + push_token(멘션 푸시).
-- A 거버넌스(message 소유). 전부 멱등(if not exists). 적용 후 db:gen-types 필수.

-- 1) message dedup key (낙관/재시도/realtime 에코의 linchpin)
alter table public.message add column if not exists client_msg_id uuid;
create unique index if not exists message_client_dedup_uniq
  on public.message(room_id, user_id, client_msg_id)
  where client_msg_id is not null;

-- 2) self-whisper belt (신규 행만 — 기존 데이터 영향 없음)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_no_self_whisper'
  ) then
    alter table public.message
      add constraint message_no_self_whisper
      check (whisper_to_user_id is null or whisper_to_user_id <> user_id) not valid;
  end if;
end $$;

-- 3) push_token (멘션 푸시 대상 토큰; Edge가 service_role로 읽음)
create table if not exists public.push_token (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists push_token_user_idx on public.push_token(user_id);
alter table public.push_token enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'push_token_all_self') then
    create policy push_token_all_self on public.push_token
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

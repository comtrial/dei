-- Rooms v1 baseline — 새 도메인 (그룹 소개팅 / 방 / 매시간 3초 영상) 전체.
--
-- 이 마이그레이션은 `20260526000000_drop_legacy_curation_chat.sql` 이 옛
-- 도메인 객체를 모두 제거한 직후 실행된다. 베이스라인은:
--   1) profiles 확장 (닉네임 unique, quiet hours, room 가용성 캐시)
--   2) 도메인 테이블 12개 (groups, group_members, match_queue, rooms,
--      room_members, hourly_uploads, chat_messages, chat_mentions, blocks,
--      reports, room_auto_kicks, room_leave_cooldowns)
--   3) blocks 양방향 view (v_block_pairs)
--   4) RLS 정책 전체
--   5) 핵심 RPC 9개 (booster 는 별도 마이그레이션)
--   6) realtime publication 추가
--
-- 설계 source of truth: docs/rooms-spec/db-design.md
-- 결정 source of truth: docs/rooms-spec/decisions.md (D1~D11)

-- ============================================================================
-- 0) profiles 확장
-- ============================================================================

alter table public.profiles
  add column if not exists nickname_lower text
    generated always as (lower(nickname)) stored,
  add column if not exists quiet_hours_start smallint not null default 0,
  add column if not exists quiet_hours_end   smallint not null default 7,
  add column if not exists is_in_active_room boolean  not null default false,
  add column if not exists last_room_leave_at timestamptz;

alter table public.profiles
  add constraint profiles_quiet_hours_start_range
    check (quiet_hours_start between 0 and 23) not valid;
alter table public.profiles
  add constraint profiles_quiet_hours_end_range
    check (quiet_hours_end between 0 and 23) not valid;
alter table public.profiles validate constraint profiles_quiet_hours_start_range;
alter table public.profiles validate constraint profiles_quiet_hours_end_range;

-- nickname unique (생성된 lower 컬럼 기준 — 대소문자 무시).
-- 기존 데이터에 중복 닉네임이 있으면 이 인덱스 생성이 실패하므로 dev 시드
-- (`seed_dev_users_for_rooms`) 가 충돌 없는 닉네임만 만든다.
create unique index if not exists profiles_nickname_lower_uniq
  on public.profiles(nickname_lower)
  where nickname_lower is not null;

-- ============================================================================
-- 1) rooms (room_members / group_members / hourly_uploads 등이 참조)
-- ============================================================================

create table if not exists public.rooms (
  id                  uuid primary key default gen_random_uuid(),
  status              text not null check (status in ('active','ended','archived')) default 'active',
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '7 days'),
  ended_at            timestamptz,
  ended_reason        text check (ended_reason in ('expired','all_members_left','admin','manual')),
  member_count        smallint not null default 0,
  active_member_count smallint not null default 0
);
create index if not exists rooms_active_idx on public.rooms(status, expires_at)
  where status = 'active';

-- ============================================================================
-- 2) groups (묶음) + group_members
-- ============================================================================

create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  leader_id       uuid not null references public.profiles(user_id) on delete cascade,
  size            smallint not null check (size between 1 and 4),
  status          text not null check (status in ('forming','queued','matched','disbanded')) default 'forming',
  matched_room_id uuid references public.rooms(id) on delete set null,
  created_at      timestamptz not null default now(),
  disbanded_at    timestamptz
);
create index if not exists groups_leader_status_idx on public.groups(leader_id, status);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(user_id) on delete cascade,
  role       text not null check (role in ('leader','member')) default 'member',
  invited_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists group_members_profile_idx on public.group_members(profile_id);

-- ============================================================================
-- 3) match_queue
-- ============================================================================

create table if not exists public.match_queue (
  id                      uuid primary key default gen_random_uuid(),
  group_id                uuid not null references public.groups(id) on delete cascade unique,
  submitter_gender        text not null check (submitter_gender in ('M','F','other')),
  desired_opponent_gender text not null check (desired_opponent_gender in ('M','F','other')),
  age_range_min           smallint,
  age_range_max           smallint,
  enqueued_at             timestamptz not null default now(),
  consumed_at             timestamptz
);
create index if not exists match_queue_open_idx
  on public.match_queue(desired_opponent_gender, enqueued_at)
  where consumed_at is null;

-- ============================================================================
-- 4) room_members
-- ============================================================================

create table if not exists public.room_members (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(user_id) on delete cascade,
  group_id   uuid references public.groups(id) on delete set null,
  status     text not null check (status in ('active','left','auto_kicked')) default 'active',
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (room_id, profile_id)
);
create index if not exists room_members_profile_active_idx
  on public.room_members(profile_id, status)
  where status = 'active';

-- ============================================================================
-- 5) hourly_uploads (3초 영상 — 블러 게이트 / 분할 피드)
-- ============================================================================

create table if not exists public.hourly_uploads (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  profile_id     uuid not null references public.profiles(user_id) on delete cascade,
  storage_path   text not null,
  thumbnail_path text,
  duration_ms    smallint not null check (duration_ms between 500 and 3500),
  hour_slot      smallint not null check (hour_slot between 0 and 23),
  slot_date      date not null,
  uploaded_at    timestamptz not null default now(),
  archived_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '30 days'),
  constraint one_upload_per_hour_slot
    unique (profile_id, room_id, slot_date, hour_slot)
);
create index if not exists hourly_uploads_room_recent_idx
  on public.hourly_uploads(room_id, uploaded_at desc)
  where archived_at is null;
create index if not exists hourly_uploads_blur_gate_idx
  on public.hourly_uploads(profile_id, room_id, uploaded_at desc);

-- ============================================================================
-- 6) chat_messages + chat_mentions
-- ============================================================================

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  author_id  uuid not null references public.profiles(user_id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_room_recent_idx
  on public.chat_messages(room_id, created_at desc)
  where deleted_at is null;

create table if not exists public.chat_mentions (
  message_id           uuid not null references public.chat_messages(id) on delete cascade,
  mentioned_profile_id uuid not null references public.profiles(user_id) on delete cascade,
  primary key (message_id, mentioned_profile_id)
);
create index if not exists chat_mentions_profile_idx
  on public.chat_mentions(mentioned_profile_id);

-- ============================================================================
-- 7) blocks (옛 본인인증 인프라 스키마 재활용) + 양방향 view
-- ============================================================================
-- `public.blocks` 테이블은 옛 onboarding 인프라(`member_onboarding_compatibility`)
-- 에서 이미 정의됨. 컬럼명: `blocker_user_id`, `blocked_user_id`, `unblocked_at`
-- (soft unblock 컬럼). 새 도메인은 영구 차단(D5) 이므로 unblock RPC 를 노출하지
-- 않는다 — 스키마 자체는 옛 것과 호환 유지.
--
-- 양방향 가시성 view 만 새로 정의 (active 차단만, unblocked_at IS NULL).

create or replace view public.v_block_pairs as
  select blocker_user_id as a, blocked_user_id as b
    from public.blocks
   where unblocked_at is null
  union
  select blocked_user_id as a, blocker_user_id as b
    from public.blocks
   where unblocked_at is null;

-- ============================================================================
-- 8) reports (신고 큐)
-- ============================================================================

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles(user_id) on delete set null,
  reported_id    uuid not null references public.profiles(user_id) on delete set null,
  room_id        uuid references public.rooms(id) on delete set null,
  reason_code    text not null check (reason_code in (
    'verbal_abuse','spam','fake_profile','inappropriate_video','harassment','other'
  )),
  reason_detail  text,
  status         text not null check (status in ('open','under_review','resolved','dismissed')) default 'open',
  reviewed_by    uuid references public.profiles(user_id),
  reviewed_at    timestamptz,
  resolution_note text,
  created_at     timestamptz not null default now(),
  constraint reason_detail_required_for_other
    check (reason_code <> 'other' or (reason_detail is not null and length(trim(reason_detail)) > 0))
);
create index if not exists reports_status_idx on public.reports(status, created_at desc);
create index if not exists reports_reported_idx on public.reports(reported_id);

-- ============================================================================
-- 9) room_auto_kicks (자동 퇴장 이력)
-- ============================================================================

create table if not exists public.room_auto_kicks (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references public.rooms(id) on delete cascade,
  kicked_profile_id   uuid not null references public.profiles(user_id) on delete cascade,
  blocks_count        smallint not null,
  total_members       smallint not null,
  triggered_at        timestamptz not null default now()
);
create unique index if not exists room_auto_kicks_unique
  on public.room_auto_kicks(room_id, kicked_profile_id);

-- ============================================================================
-- 10) room_leave_cooldowns
-- ============================================================================

create table if not exists public.room_leave_cooldowns (
  profile_id     uuid primary key references public.profiles(user_id) on delete cascade,
  cooldown_until timestamptz not null,
  source_room_id uuid references public.rooms(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ============================================================================
-- 11) RLS — 모든 테이블 활성화 + 정책
-- ============================================================================

-- blocks 테이블 자체의 RLS 는 옛 onboarding 인프라에서 이미 활성화됨 — 여기서 재진행 X.
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.match_queue          enable row level security;
alter table public.rooms                enable row level security;
alter table public.room_members         enable row level security;
alter table public.hourly_uploads       enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.chat_mentions        enable row level security;
alter table public.reports              enable row level security;
alter table public.room_auto_kicks      enable row level security;
alter table public.room_leave_cooldowns enable row level security;

-- groups: leader/member 만 select
create policy groups_select_self on public.groups
  for select using (
    leader_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.profile_id = auth.uid()
    )
  );

-- group_members: 본인 또는 같은 그룹 멤버 select
create policy group_members_select_same_group on public.group_members
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.group_members me
      where me.group_id = group_members.group_id and me.profile_id = auth.uid()
    )
  );

-- match_queue: 본인이 leader 인 group 의 큐만
create policy match_queue_select_leader on public.match_queue
  for select using (
    exists (
      select 1 from public.groups g
      where g.id = match_queue.group_id and g.leader_id = auth.uid()
    )
  );

-- rooms: 본인이 active member 인 방만 select
create policy rooms_select_active_member on public.rooms
  for select using (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = rooms.id
        and rm.profile_id = auth.uid()
        and rm.status = 'active'
    )
  );

-- room_members: 같은 방 멤버 (단, 본인이 차단한 멤버는 본인 쪽에서 안 보임 — 클라에서 필터)
create policy room_members_select_same_room on public.room_members
  for select using (
    exists (
      select 1 from public.room_members me
      where me.room_id = room_members.room_id
        and me.profile_id = auth.uid()
        and me.status = 'active'
    )
    and not exists (
      select 1 from public.v_block_pairs vp
      where vp.a = auth.uid() and vp.b = room_members.profile_id
    )
  );

-- hourly_uploads: 본인 업로드는 항상 보이고, 같은 방 다른 멤버는
-- (a) 본인이 24h 내 업로드 1건 있고 + (b) 차단 양방향 아닌 경우만.
create policy hourly_uploads_select_blur_gate on public.hourly_uploads
  for select using (
    profile_id = auth.uid()
    or (
      archived_at is null
      and exists (
        select 1 from public.room_members rm
        where rm.room_id = hourly_uploads.room_id
          and rm.profile_id = auth.uid()
          and rm.status = 'active'
      )
      and exists (
        select 1 from public.hourly_uploads me
        where me.profile_id = auth.uid()
          and me.room_id = hourly_uploads.room_id
          and me.uploaded_at > (now() - interval '24 hours')
      )
      and not exists (
        select 1 from public.v_block_pairs vp
        where vp.a = auth.uid() and vp.b = hourly_uploads.profile_id
      )
    )
  );

-- chat_messages: 같은 방 active member + 차단 양방향 아닐 때
create policy chat_messages_select_room on public.chat_messages
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.room_members rm
      where rm.room_id = chat_messages.room_id
        and rm.profile_id = auth.uid()
        and rm.status = 'active'
    )
    and not exists (
      select 1 from public.v_block_pairs vp
      where vp.a = auth.uid() and vp.b = chat_messages.author_id
    )
  );

-- chat_mentions: 본인이 멘션됐거나, 같은 방의 메시지면 모두 조회 가능
create policy chat_mentions_select_room on public.chat_mentions
  for select using (
    mentioned_profile_id = auth.uid()
    or exists (
      select 1 from public.chat_messages cm
      join public.room_members rm on rm.room_id = cm.room_id
      where cm.id = chat_mentions.message_id
        and rm.profile_id = auth.uid()
        and rm.status = 'active'
    )
  );

-- blocks 의 RLS 정책은 옛 onboarding 인프라에서 이미 정의됨 — 새로 만들 필요 없음.

-- reports: 본인이 신고한 행만
create policy reports_select_own on public.reports
  for select using (reporter_id = auth.uid());

-- room_auto_kicks: 본인 관련 행만
create policy room_auto_kicks_select_own on public.room_auto_kicks
  for select using (
    kicked_profile_id = auth.uid()
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = room_auto_kicks.room_id
        and rm.profile_id = auth.uid()
    )
  );

-- room_leave_cooldowns: 본인 행만
create policy room_leave_cooldowns_select_own on public.room_leave_cooldowns
  for select using (profile_id = auth.uid());

-- INSERT/UPDATE/DELETE 는 전부 RPC 경유 — 직접 권한 부여하지 않음.
-- service_role 은 RLS bypass 이므로 운영진 / Edge Function 은 항상 통과.

-- ============================================================================
-- 12) RPC — 핵심 9개 (booster 관련은 별도 마이그레이션)
-- ============================================================================

-- 12-1. create_group: 닉네임 배열로 묶음 생성 (D4: 가입자만)
create or replace function public.create_group(p_nicknames text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader_id uuid := auth.uid();
  v_group_id  uuid;
  v_member_id uuid;
  v_size      smallint;
  v_nick      text;
begin
  if v_leader_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_nicknames is null or array_length(p_nicknames, 1) is null then
    raise exception 'empty nicknames' using errcode = '22023';
  end if;

  -- 본인 포함 최소 1, 최대 4 (그룹 size)
  v_size := array_length(p_nicknames, 1)::smallint + 1;
  if v_size > 4 then
    raise exception 'group too large (max 4 including leader)' using errcode = '22023';
  end if;

  insert into public.groups (leader_id, size, status)
  values (v_leader_id, v_size, 'forming')
  returning id into v_group_id;

  insert into public.group_members (group_id, profile_id, role)
  values (v_group_id, v_leader_id, 'leader');

  foreach v_nick in array p_nicknames loop
    select user_id into v_member_id
      from public.profiles
     where nickname_lower = lower(trim(v_nick))
     limit 1;

    if v_member_id is null then
      raise exception 'nickname not found: %', v_nick using errcode = 'P0002';
    end if;
    if v_member_id = v_leader_id then
      raise exception 'cannot invite self' using errcode = '22023';
    end if;

    insert into public.group_members (group_id, profile_id, role)
    values (v_group_id, v_member_id, 'member')
    on conflict (group_id, profile_id) do nothing;
  end loop;

  return v_group_id;
end;
$$;

-- 12-2. disband_group: leader 가 forming 상태 그룹 해체
create or replace function public.disband_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.groups
     set status = 'disbanded', disbanded_at = now()
   where id = p_group_id
     and leader_id = v_uid
     and status = 'forming';

  if not found then
    raise exception 'group not found or not in forming state' using errcode = 'P0002';
  end if;
end;
$$;

-- 12-3. enqueue_group_for_match: D4 가용성 체크 후 큐에 적재
create or replace function public.enqueue_group_for_match(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_busy   text;
  v_gender text;
  v_queue_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- leader 본인 + forming 상태
  if not exists (
    select 1 from public.groups
     where id = p_group_id and leader_id = v_uid and status = 'forming'
  ) then
    raise exception 'group not found or not in forming state' using errcode = 'P0002';
  end if;

  -- D4: 모든 멤버가 다른 방 활성 멤버 아니어야 함
  select gm.profile_id::text into v_busy
    from public.group_members gm
    join public.room_members  rm on rm.profile_id = gm.profile_id and rm.status = 'active'
    join public.rooms         r  on r.id = rm.room_id and r.status = 'active'
   where gm.group_id = p_group_id
   limit 1;

  if v_busy is not null then
    raise exception 'member is currently in another active room: %', v_busy
      using errcode = 'P0001';
  end if;

  -- leader 의 성별을 묶음 성별로 사용 (혼성 묶음은 MVP 범위 밖)
  select gender into v_gender
    from public.profiles
   where user_id = v_uid;

  if v_gender is null then
    raise exception 'profile gender required' using errcode = '22023';
  end if;

  insert into public.match_queue (
    group_id, submitter_gender, desired_opponent_gender
  )
  values (
    p_group_id, v_gender, case v_gender when 'M' then 'F' when 'F' then 'M' else 'other' end
  )
  on conflict (group_id) do nothing
  returning id into v_queue_id;

  update public.groups set status = 'queued' where id = p_group_id;

  return v_queue_id;
end;
$$;

-- 12-4. admin_create_room: 운영진이 후보 묶음들로 방 편성
-- service_role 키로만 호출 (RLS bypass) — 운영진 도구.
create or replace function public.admin_create_room(p_group_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_gid     uuid;
  v_count   smallint := 0;
begin
  if p_group_ids is null or array_length(p_group_ids, 1) is null then
    raise exception 'empty group_ids' using errcode = '22023';
  end if;

  insert into public.rooms default values returning id into v_room_id;

  foreach v_gid in array p_group_ids loop
    -- 그룹의 멤버 전체를 room_members 에 등록
    insert into public.room_members (room_id, profile_id, group_id, status)
    select v_room_id, gm.profile_id, v_gid, 'active'
      from public.group_members gm
     where gm.group_id = v_gid
    on conflict (room_id, profile_id) do nothing;

    update public.groups
       set status = 'matched', matched_room_id = v_room_id
     where id = v_gid;

    update public.match_queue
       set consumed_at = now()
     where group_id = v_gid;
  end loop;

  -- 카운트 동기화
  select count(*)::smallint into v_count
    from public.room_members
   where room_id = v_room_id and status = 'active';

  update public.rooms
     set member_count = v_count, active_member_count = v_count
   where id = v_room_id;

  -- profiles.is_in_active_room 캐시
  update public.profiles
     set is_in_active_room = true
   where user_id in (
     select profile_id from public.room_members
      where room_id = v_room_id and status = 'active'
   );

  return v_room_id;
end;
$$;

-- 12-5. upload_hourly_video: 3초 영상 메타 적재 (storage 업로드는 클라가 먼저)
create or replace function public.upload_hourly_video(
  p_room_id        uuid,
  p_storage_path   text,
  p_thumbnail_path text,
  p_duration_ms    smallint,
  p_hour_slot      smallint,
  p_slot_date      date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- active member 확인
  if not exists (
    select 1 from public.room_members
     where room_id = p_room_id and profile_id = v_uid and status = 'active'
  ) then
    raise exception 'not an active member of room' using errcode = '42501';
  end if;

  insert into public.hourly_uploads (
    room_id, profile_id, storage_path, thumbnail_path,
    duration_ms, hour_slot, slot_date
  )
  values (
    p_room_id, v_uid, p_storage_path, p_thumbnail_path,
    p_duration_ms, p_hour_slot, p_slot_date
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 12-6. send_chat_message: 채팅 + 멘션 파싱 + chat_mentions 동시 적재
create or replace function public.send_chat_message(
  p_room_id uuid,
  p_body    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_message_id uuid;
  v_match      text;
  v_member_id  uuid;
  v_mention_re text := '@([A-Za-z0-9가-힣_]{2,30})';
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if length(p_body) < 1 or length(p_body) > 500 then
    raise exception 'body length out of range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.room_members
     where room_id = p_room_id and profile_id = v_uid and status = 'active'
  ) then
    raise exception 'not an active member of room' using errcode = '42501';
  end if;

  insert into public.chat_messages (room_id, author_id, body)
  values (p_room_id, v_uid, p_body)
  returning id into v_message_id;

  -- 멘션 파싱 — 같은 방의 active member 닉네임만 mention 으로 인정
  for v_match in
    select distinct (regexp_matches(p_body, v_mention_re, 'g'))[1]
  loop
    select rm.profile_id into v_member_id
      from public.room_members rm
      join public.profiles p on p.user_id = rm.profile_id
     where rm.room_id = p_room_id
       and rm.status = 'active'
       and p.nickname_lower = lower(v_match)
     limit 1;

    if v_member_id is not null and v_member_id <> v_uid then
      insert into public.chat_mentions (message_id, mentioned_profile_id)
      values (v_message_id, v_member_id)
      on conflict (message_id, mentioned_profile_id) do nothing;
    end if;
  end loop;

  return v_message_id;
end;
$$;

-- 12-7. block_user: 차단 + (방 컨텍스트면) 자동 퇴장 임계값 체크
create or replace function public.block_user(
  p_blocked_id     uuid,
  p_source_room_id uuid default null,
  p_reason         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_total         smallint;
  v_block_count   smallint;
  v_threshold     smallint;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_uid = p_blocked_id then
    raise exception 'cannot block self' using errcode = '22023';
  end if;

  -- 옛 스키마(blocker_user_id/blocked_user_id, unblocked_at) 사용 — D5: 영구.
  -- partial unique index `blocks_active_unique` 가 (unblocked_at IS NULL)
  -- 행의 중복 차단을 거부 → 이미 활성 차단 있으면 그대로 둠.
  insert into public.blocks (blocker_user_id, blocked_user_id, reason)
  values (v_uid, p_blocked_id, p_reason)
  on conflict do nothing;

  -- 방 컨텍스트가 주어졌다면 임계값 체크 (D9: 본인 제외 절반 이상)
  if p_source_room_id is not null then
    select active_member_count into v_total
      from public.rooms where id = p_source_room_id;

    if v_total is null or v_total <= 1 then
      return;  -- 방이 없거나 1명 이하면 자동 퇴장 의미 없음
    end if;

    -- p_blocked_id 를 차단한 멤버 수 (방 내 active 멤버 중)
    select count(*)::smallint into v_block_count
      from public.blocks b
      join public.room_members rm
        on rm.profile_id = b.blocker_user_id
       and rm.room_id = p_source_room_id
       and rm.status = 'active'
     where b.blocked_user_id = p_blocked_id
       and b.unblocked_at is null;

    -- 본인 제외 → 분모 = active_member_count - 1
    v_threshold := ceil((v_total - 1)::numeric / 2)::smallint;

    if v_block_count >= v_threshold then
      -- 자동 퇴장 처리 (idempotent)
      insert into public.room_auto_kicks (
        room_id, kicked_profile_id, blocks_count, total_members
      )
      values (p_source_room_id, p_blocked_id, v_block_count, v_total)
      on conflict (room_id, kicked_profile_id) do nothing;

      update public.room_members
         set status = 'auto_kicked', left_at = now()
       where room_id = p_source_room_id
         and profile_id = p_blocked_id
         and status = 'active';

      -- active_member_count 동기화
      update public.rooms
         set active_member_count = greatest(active_member_count - 1, 0)
       where id = p_source_room_id;

      -- is_in_active_room 캐시 해제 (다른 active 방 없을 때)
      if not exists (
        select 1 from public.room_members
         where profile_id = p_blocked_id and status = 'active'
      ) then
        update public.profiles
           set is_in_active_room = false
         where user_id = p_blocked_id;
      end if;
    end if;
  end if;
end;
$$;

-- 12-8. report_user: 신고 적재
create or replace function public.report_user(
  p_reported_id   uuid,
  p_reason_code   text,
  p_reason_detail text default null,
  p_room_id       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_uid = p_reported_id then
    raise exception 'cannot report self' using errcode = '22023';
  end if;

  insert into public.reports (
    reporter_id, reported_id, room_id, reason_code, reason_detail
  )
  values (
    v_uid, p_reported_id, p_room_id, p_reason_code, p_reason_detail
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 12-9. leave_room: 방 이탈 + 24h cooldown + (전원 이탈 시 방 종료)
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_remaining  smallint;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.room_members
     set status = 'left', left_at = now()
   where room_id = p_room_id
     and profile_id = v_uid
     and status = 'active';

  if not found then
    return;  -- 이미 나간 상태면 no-op
  end if;

  insert into public.room_leave_cooldowns (profile_id, cooldown_until, source_room_id)
  values (v_uid, now() + interval '24 hours', p_room_id)
  on conflict (profile_id)
  do update set
    cooldown_until = excluded.cooldown_until,
    source_room_id = excluded.source_room_id,
    created_at     = now();

  -- active_member_count 동기화 + (0 도달 시 방 종료)
  select greatest(active_member_count - 1, 0)::smallint
    into v_remaining
    from public.rooms where id = p_room_id;

  update public.rooms
     set active_member_count = v_remaining,
         status   = case when v_remaining = 0 then 'ended' else status end,
         ended_at = case when v_remaining = 0 then now() else ended_at end,
         ended_reason = case when v_remaining = 0 then 'all_members_left' else ended_reason end
   where id = p_room_id;

  -- profiles.is_in_active_room 캐시 (다른 active 방 없을 때 false)
  if not exists (
    select 1 from public.room_members
     where profile_id = v_uid and status = 'active'
  ) then
    update public.profiles
       set is_in_active_room = false,
           last_room_leave_at = now()
     where user_id = v_uid;
  end if;
end;
$$;

-- ============================================================================
-- 13) Realtime publication — 방 단위 분할 피드/채팅 동기화
-- ============================================================================
-- Supabase 기본 publication: supabase_realtime. 새 테이블 추가.

do $$
begin
  -- chat_messages
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
  -- hourly_uploads
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hourly_uploads'
  ) then
    execute 'alter publication supabase_realtime add table public.hourly_uploads';
  end if;
  -- room_members
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
  ) then
    execute 'alter publication supabase_realtime add table public.room_members';
  end if;
  -- rooms (status 변경 알림)
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
  -- match_queue (그룹 leader 의 큐 상태 변경)
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_queue'
  ) then
    execute 'alter publication supabase_realtime add table public.match_queue';
  end if;
exception
  when undefined_object then
    -- publication 'supabase_realtime' 가 존재하지 않는 환경(테스트 등): 무시
    null;
end;
$$;

-- ============================================================================
-- 14) PostgREST 스키마 리로드 (RPC 노출)
-- ============================================================================
notify pgrst, 'reload schema';

-- Booster grants — 즉시 재매칭 부스터 (D11).
--
-- 정책:
--   - 방 이탈 후 24h 재매칭 제한이 모든 유저에게 걸린다 (`room_leave_cooldowns`).
--   - 남성은 RevenueCat 으로 부스터 구매 → grant 적재 (source='purchase').
--   - 여성은 무료 — `grant_free_booster_for_female` RPC 로 cooldown 있을 때 grant 자동 발급.
--   - `consume_booster_grant` 가 grant 1건 consume + cooldown row 삭제.
--   - RevenueCat 환불 시 source='refund' 로 별도 row (음수 의미) — Phase 5 webhook 처리.

create table if not exists public.booster_grants (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid not null references public.profiles(user_id) on delete cascade,
  source                   text not null check (source in ('purchase','free_grant_female','promo','refund')),
  product_id               text not null,
  revenuecat_transaction_id text unique,
  granted_at               timestamptz not null default now(),
  consumed_at              timestamptz,
  consumed_for_room_id     uuid references public.rooms(id) on delete set null
);

create index if not exists booster_grants_available_idx
  on public.booster_grants(profile_id, granted_at)
  where consumed_at is null;

alter table public.booster_grants enable row level security;

create policy booster_grants_select_own on public.booster_grants
  for select using (profile_id = auth.uid());

-- ============================================================================
-- RPC
-- ============================================================================

-- grant_free_booster_for_female: 여성이고 cooldown 있을 때 무료 부스터 발급.
-- 자동 호출(클라가 cooldown 화면 진입 시) 또는 cron 으로 호출 가능.
create or replace function public.grant_free_booster_for_female()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_gender text;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select gender into v_gender from public.profiles where user_id = v_uid;
  if v_gender <> 'F' then
    raise exception 'free booster grant is restricted to female profiles'
      using errcode = '42501';
  end if;

  -- cooldown 없으면 발급 의미 없음
  if not exists (
    select 1 from public.room_leave_cooldowns
     where profile_id = v_uid and cooldown_until > now()
  ) then
    raise exception 'no active cooldown' using errcode = 'P0002';
  end if;

  -- 이미 사용가능한 grant 있으면 그것을 반환 (중복 발급 방지)
  select id into v_id
    from public.booster_grants
   where profile_id = v_uid and consumed_at is null
   limit 1;

  if v_id is null then
    insert into public.booster_grants (
      profile_id, source, product_id
    )
    values (
      v_uid, 'free_grant_female', 'booster_instant_rematch_v1'
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- consume_booster_grant: 부스터 1건 소비 + cooldown 삭제.
create or replace function public.consume_booster_grant()
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

  -- 가장 오래된 사용가능 grant 1건 선택
  select id into v_id
    from public.booster_grants
   where profile_id = v_uid and consumed_at is null
   order by granted_at asc
   limit 1
   for update;

  if v_id is null then
    raise exception 'no available booster grant' using errcode = 'P0002';
  end if;

  update public.booster_grants
     set consumed_at = now()
   where id = v_id;

  -- cooldown 제거
  delete from public.room_leave_cooldowns where profile_id = v_uid;

  return v_id;
end;
$$;

notify pgrst, 'reload schema';

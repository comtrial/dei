-- Feature flag 시스템: 사용자 상태/행동 조건 + 랜덤 A/B 로 화면 variant 결정.
-- 목표: 앱 재배포 없이 admin 이 Supabase(테이블)만 바꿔 분기 규칙을 원격 조정.
--
-- 평가는 서버 RPC(evaluate_my_flags)가 담당 — "영상 올린 지 2일" 같은 시간경과
-- 조건을 호출 시점 기준 실시간 SQL 로 계산(클라 빌드타임 박제 회피).
-- 결과값은 on/off(boolean) + variant(문자열) 둘 다 jsonb 로 표현.

-- ── ENUM ───────────────────────────────────────────────────────────────
-- 분기 조건에 쓸 수 있는 속성 화이트리스트. 새 속성은 여기 + _flag_attr_value 에 추가.
do $$ begin
  create type public.flag_attribute as enum (
    'days_since_signup',
    'days_since_first_video',
    'days_since_first_video_approved',
    'identity_verified',
    'profile_complete',
    'first_video_approved',
    'likes_sent_count',
    'likes_received_count',
    'match_count',
    'has_successful_payment',
    'gender',
    'region_sido',
    'account_state'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.flag_operator as enum ('eq','neq','gt','gte','lt','lte','in');
exception when duplicate_object then null; end $$;

-- ── 테이블 ─────────────────────────────────────────────────────────────
-- 1) 플래그 정의
create table if not exists public.feature_flags (
  key                text primary key,                       -- 'home_top_layout'
  description        text,
  enabled            boolean not null default true,           -- 마스터 스위치(false=항상 default_value)
  default_value      jsonb not null default 'false'::jsonb,   -- 매칭 룰·rollout 없을 때 (false 또는 "A")
  rollout_percentage int not null default 100 check (rollout_percentage between 0 and 100),
  rollout_variants   jsonb,                                   -- A/B 시 ["A","B"]; null 이면 on/off rollout
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 2) 룰: 속성 조합(AND). priority asc 로 첫 매칭 룰의 result_value 채택.
create table if not exists public.feature_flag_rules (
  id           uuid primary key default gen_random_uuid(),
  flag_key     text not null references public.feature_flags(key) on delete cascade,
  priority     int not null default 0,                        -- 낮을수록 먼저
  result_value jsonb not null,                                -- 매칭 시 반환 (true / "A")
  conditions   jsonb not null default '[]'::jsonb,            -- [{attribute,operator,value}, ...] 전부 AND
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists feature_flag_rules_key_priority
  on public.feature_flag_rules(flag_key, priority);

-- updated_at 자동 갱신
create or replace function public.touch_feature_flags_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch before update on public.feature_flags
  for each row execute function public.touch_feature_flags_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.feature_flags enable row level security;
alter table public.feature_flag_rules enable row level security;

-- 읽기: 인증 유저 전체(디버깅/admin 콘솔용). 평가는 SECURITY DEFINER RPC 가 하므로
-- 앱 런타임은 이 정책에 의존하지 않음.
drop policy if exists "feature_flags_select_all" on public.feature_flags;
create policy "feature_flags_select_all" on public.feature_flags
  for select to authenticated using (true);
drop policy if exists "feature_flag_rules_select_all" on public.feature_flag_rules;
create policy "feature_flag_rules_select_all" on public.feature_flag_rules
  for select to authenticated using (true);

-- 쓰기: admin 만 (dei-admin 백오피스). is_admin() = admins 테이블 active 운영자.
drop policy if exists "feature_flags_write_admin" on public.feature_flags;
create policy "feature_flags_write_admin" on public.feature_flags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "feature_flag_rules_write_admin" on public.feature_flag_rules;
create policy "feature_flag_rules_write_admin" on public.feature_flag_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 헬퍼: 단일 속성값 계산 (jsonb 로 통일 반환) ──────────────────────────
create or replace function public._flag_attr_value(
  p_attr public.flag_attribute,
  p_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  acc public.account_status;
  prof public.profiles;
begin
  select * into acc from public.account_status where user_id = p_user;
  select * into prof from public.profiles where user_id = p_user;

  return case p_attr
    when 'days_since_signup' then
      to_jsonb(floor(extract(epoch from (now() - acc.created_at)) / 86400)::int)
    when 'days_since_first_video' then
      case when acc.first_video_uploaded_at is null then 'null'::jsonb
        else to_jsonb(floor(extract(epoch from (now() - acc.first_video_uploaded_at)) / 86400)::int) end
    when 'days_since_first_video_approved' then
      case when acc.first_video_approved_at is null then 'null'::jsonb
        else to_jsonb(floor(extract(epoch from (now() - acc.first_video_approved_at)) / 86400)::int) end
    when 'identity_verified' then to_jsonb(acc.identity_verified_at is not null)
    when 'profile_complete' then to_jsonb(acc.profile_completed_at is not null)
    when 'first_video_approved' then to_jsonb(acc.first_video_approved_at is not null)
    when 'likes_sent_count' then
      to_jsonb((select count(*)::int from public.likes where from_user_id = p_user))
    when 'likes_received_count' then
      to_jsonb((select count(*)::int from public.likes where to_user_id = p_user))
    when 'match_count' then
      to_jsonb((select count(*)::int from public.matches where user_a_id = p_user or user_b_id = p_user))
    when 'has_successful_payment' then
      to_jsonb(exists (select 1 from public.payments where user_id = p_user and "결제상태" = 'SUCCESS'))
    when 'gender' then to_jsonb(prof.gender)
    when 'region_sido' then to_jsonb(prof.region_sido)
    when 'account_state' then to_jsonb(acc.account_state::text)
    else 'null'::jsonb
  end;
end;
$$;

-- ── 헬퍼: 조건 1개 비교 ────────────────────────────────────────────────
create or replace function public._flag_cond_match(
  p_actual jsonb,        -- 속성 실제값
  p_op public.flag_operator,
  p_expected jsonb       -- 룰에 저장된 기대값
)
returns boolean
language plpgsql immutable
as $$
declare
  a_num numeric;
  e_num numeric;
begin
  if p_actual is null or p_actual = 'null'::jsonb then
    return false;  -- 값 없으면 미충족 (null 비교는 항상 false)
  end if;

  -- 숫자 비교 가능 여부
  begin a_num := (p_actual #>> '{}')::numeric; exception when others then a_num := null; end;
  begin e_num := (p_expected #>> '{}')::numeric; exception when others then e_num := null; end;

  return case p_op
    when 'eq'  then p_actual = p_expected
    when 'neq' then p_actual <> p_expected
    when 'gt'  then a_num is not null and e_num is not null and a_num >  e_num
    when 'gte' then a_num is not null and e_num is not null and a_num >= e_num
    when 'lt'  then a_num is not null and e_num is not null and a_num <  e_num
    when 'lte' then a_num is not null and e_num is not null and a_num <= e_num
    when 'in'  then p_expected @> jsonb_build_array(p_actual)  -- expected 배열에 actual 포함
    else false
  end;
end;
$$;

-- ── 메인 RPC: 호출자의 모든 flag 평가 → { key: value } map ──────────────
create or replace function public.evaluate_my_flags()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb := '{}'::jsonb;
  f public.feature_flags;
  r public.feature_flag_rules;
  cond jsonb;
  all_match boolean;
  matched boolean;
  bucket int;
  variants jsonb;
  vcount int;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  for f in select * from public.feature_flags loop
    -- 1) 마스터 스위치 off → default
    if not f.enabled then
      result := result || jsonb_build_object(f.key, f.default_value);
      continue;
    end if;

    -- 2) 룰 평가 (priority asc, 첫 매칭 채택)
    matched := false;
    for r in
      select * from public.feature_flag_rules
      where flag_key = f.key and enabled = true
      order by priority asc, created_at asc
    loop
      all_match := true;
      for cond in select * from jsonb_array_elements(r.conditions) loop
        if not public._flag_cond_match(
          public._flag_attr_value((cond->>'attribute')::public.flag_attribute, uid),
          (cond->>'operator')::public.flag_operator,
          cond->'value'
        ) then
          all_match := false;
          exit;
        end if;
      end loop;
      if all_match then
        result := result || jsonb_build_object(f.key, r.result_value);
        matched := true;
        exit;
      end if;
    end loop;
    if matched then continue; end if;

    -- 3) rollout: 안정적 버킷팅 (같은 유저+key 는 항상 같은 버킷)
    bucket := (abs(hashtextextended(f.key || uid::text, 0)) % 100)::int;
    if bucket >= f.rollout_percentage then
      result := result || jsonb_build_object(f.key, f.default_value);
      continue;
    end if;

    variants := f.rollout_variants;
    if variants is not null and jsonb_typeof(variants) = 'array'
       and jsonb_array_length(variants) > 0 then
      -- variants 있음 = A/B 테스트: 그 중 안정적으로 랜덤 분배.
      vcount := jsonb_array_length(variants);
      result := result || jsonb_build_object(
        f.key,
        variants -> ((abs(hashtextextended(f.key || uid::text, 1)) % vcount)::int)
      );
    else
      -- variants 없음 = 전원 강제: default_value 를 그대로 준다.
      -- ("전원에게 특정 화면 보여주기" — admin 이 variants 비우고 default 만 설정).
      result := result || jsonb_build_object(f.key, f.default_value);
    end if;
  end loop;

  return result;
end;
$$;

revoke all on function public.evaluate_my_flags() from public;
grant execute on function public.evaluate_my_flags() to authenticated;
revoke all on function public._flag_attr_value(public.flag_attribute, uuid) from public;

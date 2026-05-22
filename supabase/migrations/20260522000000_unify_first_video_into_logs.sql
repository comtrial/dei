-- 회원가입 "첫 영상" 을 일반 영상(logs) 파이프라인으로 통합 (옵션 A: 완전 통합 + 비차단 온보딩)
--
-- 변경 전: 첫 영상은 profile_videos 에만 저장 → 자동 승인 → 검수 큐(logs 기반)에 안 뜨고
--          curation_pool(logs 기반)에도 못 들어가 다른 사용자에게 노출되지 않았다.
-- 변경 후: 첫 영상도 logs 에 저장(앱 변경)되어 일반 영상과 동일하게 검수·큐레이션을 탄다.
--          온보딩은 "첫 로그 업로드" 시점에 즉시 완료되어 검수 승인 대기로 막지 않는다.
--
-- 이 마이그레이션:
--   1) (드리프트 코드화) 승인된 로그 → curation_pool 동기화 트리거를 마이그레이션에 명시
--   2) logs 최초 INSERT 시 온보딩 완료 처리 트리거 추가 (비차단)
--   3) 게이트(can_enter_discovery / get_my_eligibility)를 "승인" 대신 "업로드" 기준으로 전환
--      + eligibility 의 영상 상태 필드를 profile_videos → logs 기준으로 재배선

-- ---------------------------------------------------------------------------
-- 1) 드리프트 코드화: 검수 승인된 로그를 curation_pool 로 동기화
--    (원격 DB 에만 존재하던 unique(log_id) 제약 + 함수 + 트리거를 멱등하게 재현)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curation_pool_log_id_key'
      and conrelid = 'public.curation_pool'::regclass
  ) then
    alter table public.curation_pool
      add constraint curation_pool_log_id_key unique (log_id);
  end if;
end $$;

create or replace function public.insert_approved_log_to_curation_pool()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."검수_상태" = 'APPROVED' and (old."검수_상태" is distinct from 'APPROVED') then
    insert into public.curation_pool (
      user_id, log_id, pool_date, "검수_YN", "차단_YN", video_path
    )
    values (
      new.user_id, new.id, current_date, 'Y', 'N', new.video_url
    )
    on conflict (log_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists logs_sync_curation_pool on public.logs;
create trigger logs_sync_curation_pool
  after update on public.logs
  for each row execute function public.insert_approved_log_to_curation_pool();

-- ---------------------------------------------------------------------------
-- 2) 비차단 온보딩: 온보딩 중인 유저가 첫 로그를 업로드하면 즉시 온보딩 완료
--    (이미 온보딩을 마친 유저의 일상 로그 INSERT 에는 영향 없음 — WHERE 가드)
-- ---------------------------------------------------------------------------
create or replace function public.complete_onboarding_on_first_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.account_status
  set
    first_video_uploaded_at = coalesce(first_video_uploaded_at, now()),
    discovery_enabled_at = case
      when identity_verified_at is not null and profile_completed_at is not null
        then coalesce(discovery_enabled_at, now())
      else discovery_enabled_at
    end,
    onboarding_state = 'complete'::public.onboarding_state,
    updated_at = now()
  where user_id = new.user_id
    and onboarding_state in (
      'first_video'::public.onboarding_state,
      'video_review'::public.onboarding_state
    );
  return new;
end;
$$;

drop trigger if exists logs_complete_onboarding on public.logs;
create trigger logs_complete_onboarding
  after insert on public.logs
  for each row execute function public.complete_onboarding_on_first_log();

-- ---------------------------------------------------------------------------
-- 3) 게이트 전환: 매칭 입장 조건을 "첫 영상 승인" → "첫 영상 업로드" 로 변경
-- ---------------------------------------------------------------------------
create or replace function public.can_enter_discovery(target_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_user_id uuid := coalesce(target_user_id, auth.uid());
begin
  if resolved_user_id is null then
    return false;
  end if;

  if resolved_user_id <> auth.uid() and not public.is_admin() then
    return false;
  end if;

  return exists (
    select 1
    from public.account_status account
    where account.user_id = resolved_user_id
      and account.account_state = 'active'
      and account.identity_verified_at is not null
      and account.profile_completed_at is not null
      and account.first_video_uploaded_at is not null
      and account.discovery_enabled_at is not null
  );
end;
$$;

-- get_my_eligibility: next_step 의 video_review(승인 대기) 단계 제거 +
-- 영상 상태 필드(latest_video_*, first_video_approved)를 logs 기준으로 재배선
create or replace function public.get_my_eligibility()
returns table (
  account_user_id uuid,
  account_state public.account_state,
  onboarding_state public.onboarding_state,
  has_accepted_terms boolean,
  identity_verified boolean,
  age_eligible boolean,
  profile_complete boolean,
  first_video_uploaded boolean,
  first_video_approved boolean,
  can_enter_discovery boolean,
  next_step public.onboarding_state,
  latest_video_id uuid,
  latest_video_status public.moderation_status,
  latest_video_rejection_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_account public.account_status;
  consent_exists boolean;
  latest_log public.logs;
  has_approved_log boolean;
  resolved_next_step public.onboarding_state;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.profiles (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  insert into public.private_profiles (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  insert into public.account_status (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select *
  into current_account
  from public.account_status
  where account_status.user_id = current_user_id;

  select exists (
    select 1
    from public.user_consents
    where user_consents.user_id = current_user_id
  )
  into consent_exists;

  -- 첫 영상이 logs 로 통합되었으므로 최신 영상/승인 여부를 logs 에서 본다.
  select *
  into latest_log
  from public.logs
  where logs.user_id = current_user_id
  order by logs.created_at desc
  limit 1;

  select exists (
    select 1
    from public.logs
    where logs.user_id = current_user_id
      and logs."검수_상태" = 'APPROVED'
  )
  into has_approved_log;

  resolved_next_step := case
    when current_account.account_state <> 'active' then current_account.onboarding_state
    when not consent_exists then 'terms'::public.onboarding_state
    when current_account.identity_verified_at is null then
      case
        when current_account.onboarding_state = 'identity_verification' then 'identity_verification'::public.onboarding_state
        else 'phone'::public.onboarding_state
      end
    when current_account.profile_completed_at is null then 'profile'::public.onboarding_state
    when current_account.onboarding_state = 'log_intro'
      and current_account.first_video_uploaded_at is null then 'log_intro'::public.onboarding_state
    when current_account.first_video_uploaded_at is null then 'first_video'::public.onboarding_state
    else 'complete'::public.onboarding_state
  end;

  return query
  select
    current_user_id,
    current_account.account_state,
    current_account.onboarding_state,
    consent_exists,
    current_account.identity_verified_at is not null,
    current_account.age_eligible,
    current_account.profile_completed_at is not null,
    current_account.first_video_uploaded_at is not null,
    has_approved_log,
    public.can_enter_discovery(current_user_id),
    resolved_next_step,
    latest_log.id,
    case
      when latest_log."검수_상태" is null then null
      else lower(latest_log."검수_상태")::public.moderation_status
    end,
    null::text;
end;
$$;

notify pgrst, 'reload schema';

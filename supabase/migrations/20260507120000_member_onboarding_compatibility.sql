create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.account_state as enum ('active', 'suspended', 'banned', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.onboarding_state as enum (
    'terms',
    'phone',
    'identity_verification',
    'profile',
    'log_intro',
    'first_video',
    'video_review',
    'complete'
  );
exception when duplicate_object then null; end $$;

alter type public.onboarding_state add value if not exists 'log_intro' after 'profile';

do $$ begin
  create type public.identity_provider as enum ('portone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum (
    'pending',
    'verified',
    'failed',
    'expired',
    'canceled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.device_platform as enum ('ios', 'android', 'web');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.push_provider as enum ('expo', 'apns', 'fcm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_source_type as enum ('report', 'profile_video', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_case_status as enum ('open', 'in_review', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists interest_categories text[] not null default '{}'::text[],
  add column if not exists interest_tags text[] not null default '{}'::text[];

do $$ begin
  alter table public.profiles
    add constraint profiles_interest_tags_count
    check (coalesce(array_length(interest_tags, 1), 0) between 0 and 10);
exception when duplicate_object then null; end $$;

create table if not exists public.private_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  phone_country_code text,
  phone_hash text,
  ci_hash text,
  di_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_profiles_birth_date_min check (
    birth_date is null
    or birth_date >= date '1900-01-01'
  ),
  constraint private_profiles_phone_country_code_length check (
    phone_country_code is null
    or char_length(phone_country_code) between 1 and 8
  )
);

create unique index if not exists private_profiles_ci_hash_unique
  on public.private_profiles(ci_hash)
  where ci_hash is not null;

create index if not exists private_profiles_di_hash_idx
  on public.private_profiles(di_hash)
  where di_hash is not null;

create index if not exists private_profiles_phone_hash_idx
  on public.private_profiles(phone_hash)
  where phone_hash is not null;

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_state public.account_state not null default 'active',
  onboarding_state public.onboarding_state not null default 'terms',
  identity_verified_at timestamptz,
  age_verified_at timestamptz,
  age_eligible boolean not null default true,
  profile_completed_at timestamptz,
  first_video_uploaded_at timestamptz,
  first_video_approved_at timestamptz,
  discovery_enabled_at timestamptz,
  suspended_at timestamptz,
  banned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.identity_provider not null default 'portone',
  provider_verification_id text,
  status public.verification_status not null default 'pending',
  phone_country_code text,
  phone_hash text,
  ci_hash text,
  di_hash text,
  adult_verified boolean,
  birth_year integer,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  failure_message text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_verifications_birth_year_range check (
    birth_year is null
    or birth_year between 1900 and 2100
  )
);

create unique index if not exists identity_verifications_provider_id_unique
  on public.identity_verifications(provider, provider_verification_id)
  where provider_verification_id is not null;

create index if not exists identity_verifications_user_status_idx
  on public.identity_verifications(user_id, status, requested_at desc);

create index if not exists identity_verifications_ci_hash_idx
  on public.identity_verifications(ci_hash)
  where ci_hash is not null;

create index if not exists identity_verifications_di_hash_idx
  on public.identity_verifications(di_hash)
  where di_hash is not null;

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  community_guidelines_version text not null,
  age_policy_version text not null,
  marketing_push_opt_in boolean not null default false,
  marketing_email_opt_in boolean not null default false,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_consents_terms_version_length check (char_length(trim(terms_version)) between 1 and 80),
  constraint user_consents_privacy_version_length check (char_length(trim(privacy_version)) between 1 and 80),
  constraint user_consents_guidelines_version_length check (char_length(trim(community_guidelines_version)) between 1 and 80),
  constraint user_consents_age_policy_version_length check (char_length(trim(age_policy_version)) between 1 and 80)
);

create index if not exists user_consents_user_accepted_idx
  on public.user_consents(user_id, accepted_at desc);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform public.device_platform not null,
  installation_id_hash text not null,
  push_provider public.push_provider,
  push_token text,
  app_version text,
  device_label text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_devices_installation_hash_length check (char_length(trim(installation_id_hash)) between 16 and 256),
  constraint user_devices_push_token_length check (push_token is null or char_length(push_token) <= 512)
);

create unique index if not exists user_devices_installation_unique
  on public.user_devices(user_id, installation_id_hash);

create unique index if not exists user_devices_active_push_token_unique
  on public.user_devices(push_token)
  where push_token is not null and revoked_at is null;

create table if not exists public.profile_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'profile-videos',
  storage_path text not null,
  duration_ms integer not null,
  mime_type text not null default 'video/mp4',
  file_size_bytes integer,
  moderation_status public.moderation_status not null default 'pending',
  is_primary boolean not null default false,
  rejection_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_videos_bucket_check check (storage_bucket = 'profile-videos'),
  constraint profile_videos_duration_check check (duration_ms between 1500 and 2500),
  constraint profile_videos_file_size_check check (
    file_size_bytes is null
    or file_size_bytes between 1 and 52428800
  ),
  constraint profile_videos_mime_check check (mime_type in ('video/mp4', 'video/quicktime')),
  constraint profile_videos_rejection_reason_length check (
    rejection_reason is null
    or char_length(rejection_reason) <= 500
  )
);

create unique index if not exists profile_videos_storage_path_unique
  on public.profile_videos(storage_bucket, storage_path);

create unique index if not exists profile_videos_one_primary_per_user
  on public.profile_videos(user_id)
  where is_primary = true and moderation_status <> 'removed';

create index if not exists profile_videos_user_moderation_idx
  on public.profile_videos(user_id, moderation_status, created_at desc);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  unblocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocks_no_self_block check (blocker_user_id <> blocked_user_id),
  constraint blocks_reason_length check (reason is null or char_length(reason) <= 500)
);

create unique index if not exists blocks_active_unique
  on public.blocks(blocker_user_id, blocked_user_id)
  where unblocked_at is null;

create index if not exists blocks_blocked_user_idx
  on public.blocks(blocked_user_id)
  where unblocked_at is null;

create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  source_type public.moderation_source_type not null,
  source_id uuid,
  subject_user_id uuid references auth.users(id) on delete set null,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  status public.moderation_case_status not null default 'open',
  priority smallint not null default 2,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint moderation_cases_priority_range check (priority between 0 and 3),
  constraint moderation_cases_resolution_length check (
    resolution is null
    or char_length(resolution) <= 1000
  )
);

create index if not exists moderation_cases_status_priority_idx
  on public.moderation_cases(status, priority, created_at asc);

create index if not exists moderation_cases_subject_idx
  on public.moderation_cases(subject_user_id, created_at desc);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  object_type text,
  object_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_actions_action_type_length check (char_length(trim(action_type)) between 1 and 120),
  constraint admin_actions_object_type_length check (object_type is null or char_length(trim(object_type)) between 1 and 120)
);

create index if not exists admin_actions_target_idx
  on public.admin_actions(target_user_id, created_at desc);

drop trigger if exists private_profiles_set_updated_at on public.private_profiles;
create trigger private_profiles_set_updated_at
  before update on public.private_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists account_status_set_updated_at on public.account_status;
create trigger account_status_set_updated_at
  before update on public.account_status
  for each row execute function public.set_updated_at();

drop trigger if exists identity_verifications_set_updated_at on public.identity_verifications;
create trigger identity_verifications_set_updated_at
  before update on public.identity_verifications
  for each row execute function public.set_updated_at();

drop trigger if exists user_devices_set_updated_at on public.user_devices;
create trigger user_devices_set_updated_at
  before update on public.user_devices
  for each row execute function public.set_updated_at();

drop trigger if exists profile_videos_set_updated_at on public.profile_videos;
create trigger profile_videos_set_updated_at
  before update on public.profile_videos
  for each row execute function public.set_updated_at();

drop trigger if exists blocks_set_updated_at on public.blocks;
create trigger blocks_set_updated_at
  before update on public.blocks
  for each row execute function public.set_updated_at();

drop trigger if exists moderation_cases_set_updated_at on public.moderation_cases;
create trigger moderation_cases_set_updated_at
  before update on public.moderation_cases
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.private_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.account_status (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_client_block_identity_changes()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.blocker_user_id is distinct from old.blocker_user_id
      or new.blocked_user_id is distinct from old.blocked_user_id then
      raise exception 'block participants cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists blocks_prevent_client_identity_changes on public.blocks;
create trigger blocks_prevent_client_identity_changes
  before update on public.blocks
  for each row execute function public.prevent_client_block_identity_changes();

create or replace function public.create_moderation_case_for_profile_video()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_cases (
    source_type,
    source_id,
    subject_user_id,
    priority
  )
  values (
    'profile_video',
    new.id,
    new.user_id,
    2
  );

  update public.account_status
  set
    first_video_uploaded_at = coalesce(first_video_uploaded_at, now()),
    onboarding_state = case
      when onboarding_state = 'first_video' then 'video_review'::public.onboarding_state
      else onboarding_state
    end
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists profile_videos_create_moderation_case on public.profile_videos;
create trigger profile_videos_create_moderation_case
  after insert on public.profile_videos
  for each row execute function public.create_moderation_case_for_profile_video();

create or replace function public.sync_profile_video_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'approved'
    and old.moderation_status is distinct from new.moderation_status then
    update public.account_status
    set
      first_video_approved_at = coalesce(first_video_approved_at, now()),
      onboarding_state = case
        when onboarding_state in ('video_review', 'first_video') then 'complete'::public.onboarding_state
        else onboarding_state
      end,
      discovery_enabled_at = case
        when identity_verified_at is not null
          and profile_completed_at is not null
        then coalesce(discovery_enabled_at, now())
        else discovery_enabled_at
      end
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists profile_videos_sync_approval on public.profile_videos;
create trigger profile_videos_sync_approval
  after update of moderation_status on public.profile_videos
  for each row execute function public.sync_profile_video_approval();

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
      and account.first_video_approved_at is not null
      and account.discovery_enabled_at is not null
  );
end;
$$;

create or replace function public.accept_required_consents(
  p_terms_version text,
  p_privacy_version text,
  p_community_guidelines_version text,
  p_age_policy_version text,
  p_marketing_push_opt_in boolean default false,
  p_marketing_email_opt_in boolean default false
)
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  updated_account public.account_status;
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

  insert into public.user_consents (
    user_id,
    terms_version,
    privacy_version,
    community_guidelines_version,
    age_policy_version,
    marketing_push_opt_in,
    marketing_email_opt_in
  )
  values (
    current_user_id,
    p_terms_version,
    p_privacy_version,
    p_community_guidelines_version,
    p_age_policy_version,
    p_marketing_push_opt_in,
    p_marketing_email_opt_in
  );

  update public.account_status
  set onboarding_state = case
    when onboarding_state = 'terms' then 'phone'::public.onboarding_state
    else onboarding_state
  end
  where account_status.user_id = current_user_id
  returning * into updated_account;

  return updated_account;
end;
$$;

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
  latest_video public.profile_videos;
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

  select *
  into latest_video
  from public.profile_videos
  where profile_videos.user_id = current_user_id
    and profile_videos.moderation_status <> 'removed'
  order by profile_videos.created_at desc
  limit 1;

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
    when current_account.first_video_approved_at is null then 'video_review'::public.onboarding_state
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
    current_account.first_video_approved_at is not null,
    public.can_enter_discovery(current_user_id),
    resolved_next_step,
    latest_video.id,
    latest_video.moderation_status,
    latest_video.rejection_reason;
end;
$$;

create or replace function public.complete_profile(
  p_display_name text,
  p_gender text default null,
  p_bio text default null,
  p_birth_date date default null,
  p_region_sido text default null,
  p_region_sigungu text default null,
  p_mbti text default null,
  p_profile_image_path text default null,
  p_interest_categories text[] default '{}'::text[],
  p_interest_tags text[] default '{}'::text[]
)
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_account public.account_status;
  normalized_gender text;
  updated_account public.account_status;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into current_account
  from public.account_status
  where account_status.user_id = current_user_id;

  if current_account.user_id is null then
    raise exception 'account status is required';
  end if;

  if current_account.account_state <> 'active' then
    raise exception 'account is not active';
  end if;

  if current_account.identity_verified_at is null then
    raise exception 'identity verification is required';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'display name is required';
  end if;

  if p_birth_date is null then
    raise exception 'birth date is required';
  end if;

  if p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'birth date is invalid';
  end if;

  normalized_gender := case nullif(trim(p_gender), '')
    when '여성' then 'F'
    when 'female' then 'F'
    when 'F' then 'F'
    when '남성' then 'M'
    when 'male' then 'M'
    when 'M' then 'M'
    else null
  end;

  if normalized_gender is null then
    raise exception 'gender is required';
  end if;

  if nullif(trim(p_region_sido), '') is null or nullif(trim(p_region_sigungu), '') is null then
    raise exception 'region is required';
  end if;

  if coalesce(array_length(p_interest_tags, 1), 0) < 3
    or coalesce(array_length(p_interest_tags, 1), 0) > 10 then
    raise exception 'interest tags must be between 3 and 10';
  end if;

  insert into public.profiles (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set
    nickname = nullif(trim(p_display_name), ''),
    gender = normalized_gender,
    intro = nullif(trim(p_bio), ''),
    birth_date = p_birth_date,
    region_sido = nullif(trim(p_region_sido), ''),
    region_sigungu = nullif(trim(p_region_sigungu), ''),
    mbti = nullif(trim(p_mbti), ''),
    photo_url = nullif(trim(p_profile_image_path), ''),
    interest_categories = coalesce(p_interest_categories, '{}'::text[]),
    interest_tags = coalesce(p_interest_tags, '{}'::text[])
  where profiles.user_id = current_user_id;

  insert into public.private_profiles (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.private_profiles
  set
    birth_date = p_birth_date,
    updated_at = now()
  where private_profiles.user_id = current_user_id;

  update public.account_status
  set
    profile_completed_at = coalesce(profile_completed_at, now()),
    onboarding_state = case
      when onboarding_state = 'profile' then 'log_intro'::public.onboarding_state
      else onboarding_state
    end
  where account_status.user_id = current_user_id
  returning * into updated_account;

  return updated_account;
end;
$$;

create or replace function public.complete_log_intro()
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_account public.account_status;
  updated_account public.account_status;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into current_account
  from public.account_status
  where account_status.user_id = current_user_id;

  if current_account.user_id is null then
    raise exception 'account status is required';
  end if;

  if current_account.account_state <> 'active' then
    raise exception 'account is not active';
  end if;

  if current_account.identity_verified_at is null then
    raise exception 'identity verification is required';
  end if;

  if current_account.profile_completed_at is null then
    raise exception 'profile completion is required';
  end if;

  update public.account_status
  set onboarding_state = case
    when onboarding_state = 'log_intro' then 'first_video'::public.onboarding_state
    else onboarding_state
  end
  where account_status.user_id = current_user_id
  returning * into updated_account;

  return updated_account;
end;
$$;

create or replace function public.complete_local_dev_identity_verification()
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  updated_account public.account_status;
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

  insert into public.identity_verifications (
    user_id,
    provider,
    provider_verification_id,
    status,
    phone_country_code,
    phone_hash,
    verified_at,
    provider_metadata
  )
  values (
    current_user_id,
    'portone',
    'local-dev-' || current_user_id::text,
    'verified',
    '+82',
    'local-dev-phone-hash',
    now(),
    '{"source":"local_dev"}'::jsonb
  )
  on conflict (provider, provider_verification_id)
  where provider_verification_id is not null
  do update
    set status = 'verified',
        verified_at = now(),
        failed_at = null,
        failure_code = null,
        failure_message = null,
        provider_metadata = excluded.provider_metadata,
        updated_at = now();

  update public.private_profiles
     set phone_country_code = '+82',
         phone_hash = 'local-dev-phone-hash',
         updated_at = now()
   where user_id = current_user_id;

  update public.account_status
     set identity_verified_at = coalesce(identity_verified_at, now()),
         age_eligible = true,
         onboarding_state = case
           when onboarding_state in ('terms', 'phone', 'identity_verification') then 'profile'::public.onboarding_state
           else onboarding_state
         end,
         updated_at = now()
   where user_id = current_user_id
   returning *
    into updated_account;

  return updated_account;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-images',
  'profile-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-videos',
  'profile-videos',
  false,
  52428800,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.private_profiles enable row level security;
alter table public.account_status enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.user_consents enable row level security;
alter table public.user_devices enable row level security;
alter table public.profile_videos enable row level security;
alter table public.blocks enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists "private_profiles_select_own_or_admin" on public.private_profiles;
create policy "private_profiles_select_own_or_admin"
  on public.private_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "private_profiles_insert_own" on public.private_profiles;
create policy "private_profiles_insert_own"
  on public.private_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "private_profiles_update_own" on public.private_profiles;
create policy "private_profiles_update_own"
  on public.private_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "private_profiles_admin_all" on public.private_profiles;
create policy "private_profiles_admin_all"
  on public.private_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "account_status_select_own_or_admin" on public.account_status;
create policy "account_status_select_own_or_admin"
  on public.account_status for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "account_status_admin_all" on public.account_status;
create policy "account_status_admin_all"
  on public.account_status for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "identity_verifications_select_own_or_admin" on public.identity_verifications;
create policy "identity_verifications_select_own_or_admin"
  on public.identity_verifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "identity_verifications_admin_all" on public.identity_verifications;
create policy "identity_verifications_admin_all"
  on public.identity_verifications for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_consents_select_own_or_admin" on public.user_consents;
create policy "user_consents_select_own_or_admin"
  on public.user_consents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_consents_insert_own" on public.user_consents;
create policy "user_consents_insert_own"
  on public.user_consents for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_consents_admin_all" on public.user_consents;
create policy "user_consents_admin_all"
  on public.user_consents for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_devices_select_own_or_admin" on public.user_devices;
create policy "user_devices_select_own_or_admin"
  on public.user_devices for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_devices_insert_own" on public.user_devices;
create policy "user_devices_insert_own"
  on public.user_devices for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_devices_update_own" on public.user_devices;
create policy "user_devices_update_own"
  on public.user_devices for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_devices_delete_own" on public.user_devices;
create policy "user_devices_delete_own"
  on public.user_devices for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_devices_admin_all" on public.user_devices;
create policy "user_devices_admin_all"
  on public.user_devices for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profile_videos_select_own_or_admin" on public.profile_videos;
create policy "profile_videos_select_own_or_admin"
  on public.profile_videos for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "profile_videos_insert_own_pending" on public.profile_videos;
create policy "profile_videos_insert_own_pending"
  on public.profile_videos for insert to authenticated
  with check (
    user_id = auth.uid()
    and moderation_status = 'pending'
    and storage_bucket = 'profile-videos'
  );

drop policy if exists "profile_videos_admin_all" on public.profile_videos;
create policy "profile_videos_admin_all"
  on public.profile_videos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "blocks_select_own_or_admin" on public.blocks;
create policy "blocks_select_own_or_admin"
  on public.blocks for select to authenticated
  using (
    blocker_user_id = auth.uid()
    or blocked_user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check (blocker_user_id = auth.uid());

drop policy if exists "blocks_update_own" on public.blocks;
create policy "blocks_update_own"
  on public.blocks for update to authenticated
  using (blocker_user_id = auth.uid())
  with check (blocker_user_id = auth.uid());

drop policy if exists "blocks_admin_all" on public.blocks;
create policy "blocks_admin_all"
  on public.blocks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "moderation_cases_admin_all" on public.moderation_cases;
create policy "moderation_cases_admin_all"
  on public.moderation_cases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_actions_admin_all" on public.admin_actions;
create policy "admin_actions_admin_all"
  on public.admin_actions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profile_image_objects_select_own_or_admin" on storage.objects;
create policy "profile_image_objects_select_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_image_objects_insert_own" on storage.objects;
create policy "profile_image_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_image_objects_update_own_or_admin" on storage.objects;
create policy "profile_image_objects_update_own_or_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_image_objects_delete_own_or_admin" on storage.objects;
create policy "profile_image_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_select_own_or_admin" on storage.objects;
create policy "profile_video_objects_select_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_insert_own" on storage.objects;
create policy "profile_video_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_video_objects_update_own_or_admin" on storage.objects;
create policy "profile_video_objects_update_own_or_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_delete_own_or_admin" on storage.objects;
create policy "profile_video_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

grant execute on function public.get_my_eligibility() to authenticated;
grant execute on function public.accept_required_consents(text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.complete_profile(
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text[],
  text[]
) to authenticated;
grant execute on function public.complete_log_intro() to authenticated;
grant execute on function public.complete_local_dev_identity_verification() to authenticated;
grant execute on function public.can_enter_discovery(uuid) to authenticated;

insert into public.private_profiles (user_id, birth_date)
select user_id, birth_date
from public.profiles
on conflict (user_id) do update
set birth_date = coalesce(public.private_profiles.birth_date, excluded.birth_date);

insert into public.user_consents (
  user_id,
  terms_version,
  privacy_version,
  community_guidelines_version,
  age_policy_version,
  accepted_at
)
select
  profiles.user_id,
  'legacy-remote-20260507',
  'legacy-remote-20260507',
  'legacy-remote-20260507',
  'legacy-remote-20260507',
  coalesce(profiles.created_at, now())
from public.profiles profiles
where not exists (
  select 1
  from public.user_consents consents
  where consents.user_id = profiles.user_id
);

insert into public.account_status (
  user_id,
  account_state,
  onboarding_state,
  identity_verified_at,
  age_eligible,
  profile_completed_at,
  first_video_uploaded_at,
  first_video_approved_at,
  discovery_enabled_at,
  suspended_at,
  deleted_at,
  created_at,
  updated_at
)
select
  profiles.user_id,
  case profiles."회원상태"
    when 'SUSPENDED' then 'suspended'::public.account_state
    when 'WITHDRAWN' then 'deleted'::public.account_state
    else 'active'::public.account_state
  end,
  'terms'::public.onboarding_state,
  case when profiles.phone is not null then coalesce(profiles.created_at, now()) end,
  true,
  case
    when profiles.nickname is not null
      and profiles.birth_date is not null
      and profiles.gender is not null
      and profiles.region_sido is not null
      and profiles.region_sigungu is not null
    then coalesce(profiles.updated_at, profiles.created_at, now())
  end,
  video_stats.first_uploaded_at,
  video_stats.first_approved_at,
  case
    when profiles."회원상태" = 'ACTIVE'
      and profiles.phone is not null
      and profiles.nickname is not null
      and profiles.birth_date is not null
      and profiles.gender is not null
      and profiles.region_sido is not null
      and profiles.region_sigungu is not null
      and video_stats.first_approved_at is not null
    then video_stats.first_approved_at
  end,
  case when profiles."회원상태" = 'SUSPENDED' then coalesce(profiles.blocked_until, profiles.updated_at, now()) end,
  case when profiles."회원상태" = 'WITHDRAWN' then coalesce(profiles.updated_at, now()) end,
  coalesce(profiles.created_at, now()),
  now()
from public.profiles profiles
left join lateral (
  select
    min(logs.created_at) as first_uploaded_at,
    min(logs.created_at) filter (where logs."검수_상태" = 'APPROVED') as first_approved_at
  from public.logs logs
  where logs.user_id = profiles.user_id
) video_stats on true
on conflict (user_id) do nothing;

update public.account_status account
set
  onboarding_state = case
    when account.account_state <> 'active' then account.onboarding_state
    when not exists (
      select 1
      from public.user_consents consents
      where consents.user_id = account.user_id
    ) then 'terms'::public.onboarding_state
    when account.identity_verified_at is null then 'phone'::public.onboarding_state
    when account.profile_completed_at is null then 'profile'::public.onboarding_state
    when account.first_video_uploaded_at is null then 'log_intro'::public.onboarding_state
    when account.first_video_approved_at is null then 'video_review'::public.onboarding_state
    else 'complete'::public.onboarding_state
  end,
  discovery_enabled_at = case
    when account.account_state = 'active'
      and account.identity_verified_at is not null
      and account.profile_completed_at is not null
      and account.first_video_approved_at is not null
    then coalesce(account.discovery_enabled_at, account.first_video_approved_at, now())
    else account.discovery_enabled_at
  end,
  updated_at = now();

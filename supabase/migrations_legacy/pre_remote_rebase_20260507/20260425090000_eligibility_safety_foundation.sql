create extension if not exists "pgcrypto" with schema extensions;

create type public.account_state as enum (
  'active',
  'suspended',
  'banned',
  'deleted'
);

create type public.onboarding_state as enum (
  'terms',
  'phone',
  'identity_verification',
  'profile',
  'first_video',
  'video_review',
  'complete'
);

create type public.identity_provider as enum (
  'portone'
);

create type public.verification_status as enum (
  'pending',
  'verified',
  'failed',
  'expired',
  'canceled'
);

create type public.device_platform as enum (
  'ios',
  'android',
  'web'
);

create type public.push_provider as enum (
  'expo',
  'apns',
  'fcm'
);

create type public.moderation_status as enum (
  'pending',
  'approved',
  'rejected',
  'removed'
);

create type public.report_reason as enum (
  'underage',
  'harassment',
  'hate_or_abuse',
  'sexual_content',
  'violence',
  'spam_or_scam',
  'impersonation',
  'illegal_activity',
  'other'
);

create type public.report_status as enum (
  'open',
  'in_review',
  'resolved',
  'dismissed'
);

create type public.moderation_source_type as enum (
  'report',
  'profile_video',
  'user'
);

create type public.moderation_case_status as enum (
  'open',
  'in_review',
  'resolved',
  'dismissed'
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'moderator')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ?| array['admin', 'moderator'];
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  gender text,
  bio text,
  profile_status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null
    or char_length(trim(display_name)) between 1 and 40
  ),
  constraint profiles_gender_length check (
    gender is null
    or char_length(trim(gender)) between 1 and 40
  ),
  constraint profiles_bio_length check (
    bio is null
    or char_length(bio) <= 300
  )
);

create table public.private_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  phone_country_code text,
  phone_hash text,
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

create table public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_state public.account_state not null default 'active',
  onboarding_state public.onboarding_state not null default 'terms',
  identity_verified_at timestamptz,
  age_verified_at timestamptz,
  age_eligible boolean not null default false,
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

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.identity_provider not null default 'portone',
  provider_verification_id text,
  status public.verification_status not null default 'pending',
  phone_country_code text,
  phone_hash text,
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

create unique index identity_verifications_provider_id_unique
  on public.identity_verifications(provider, provider_verification_id)
  where provider_verification_id is not null;

create index identity_verifications_user_status_idx
  on public.identity_verifications(user_id, status, requested_at desc);

create table public.user_consents (
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

create index user_consents_user_accepted_idx
  on public.user_consents(user_id, accepted_at desc);

create table public.user_devices (
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

create unique index user_devices_installation_unique
  on public.user_devices(user_id, installation_id_hash);

create unique index user_devices_active_push_token_unique
  on public.user_devices(push_token)
  where push_token is not null and revoked_at is null;

create table public.profile_videos (
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

create unique index profile_videos_storage_path_unique
  on public.profile_videos(storage_bucket, storage_path);

create unique index profile_videos_one_primary_per_user
  on public.profile_videos(user_id)
  where is_primary = true and moderation_status <> 'removed';

create index profile_videos_user_moderation_idx
  on public.profile_videos(user_id, moderation_status, created_at desc);

create table public.blocks (
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

create unique index blocks_active_unique
  on public.blocks(blocker_user_id, blocked_user_id)
  where unblocked_at is null;

create index blocks_blocked_user_idx
  on public.blocks(blocked_user_id)
  where unblocked_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  target_type public.moderation_source_type not null default 'user',
  target_id uuid,
  reason public.report_reason not null,
  description text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_no_self_report check (reporter_user_id <> reported_user_id),
  constraint reports_description_length check (
    description is null
    or char_length(description) <= 2000
  )
);

create index reports_reporter_idx
  on public.reports(reporter_user_id, created_at desc);

create index reports_reported_status_idx
  on public.reports(reported_user_id, status, created_at desc);

create table public.moderation_cases (
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

create index moderation_cases_status_priority_idx
  on public.moderation_cases(status, priority, created_at asc);

create index moderation_cases_subject_idx
  on public.moderation_cases(subject_user_id, created_at desc);

create table public.admin_actions (
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

create index admin_actions_target_idx
  on public.admin_actions(target_user_id, created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger private_profiles_set_updated_at
  before update on public.private_profiles
  for each row execute function public.set_updated_at();

create trigger account_status_set_updated_at
  before update on public.account_status
  for each row execute function public.set_updated_at();

create trigger identity_verifications_set_updated_at
  before update on public.identity_verifications
  for each row execute function public.set_updated_at();

create trigger user_devices_set_updated_at
  before update on public.user_devices
  for each row execute function public.set_updated_at();

create trigger profile_videos_set_updated_at
  before update on public.profile_videos
  for each row execute function public.set_updated_at();

create trigger blocks_set_updated_at
  before update on public.blocks
  for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

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
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.private_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.account_status (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_client_profile_authority_changes()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.id is distinct from old.id then
      raise exception 'profile id cannot be changed';
    end if;

    if new.profile_status is distinct from old.profile_status then
      raise exception 'profile moderation status cannot be changed by clients';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_client_authority_changes
  before update on public.profiles
  for each row execute function public.prevent_client_profile_authority_changes();

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

create trigger blocks_prevent_client_identity_changes
  before update on public.blocks
  for each row execute function public.prevent_client_block_identity_changes();

create or replace function public.create_moderation_case_for_report()
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
    'report',
    new.id,
    new.reported_user_id,
    case
      when new.reason in ('underage', 'illegal_activity', 'violence') then 0
      when new.reason in ('harassment', 'hate_or_abuse', 'sexual_content') then 1
      else 2
    end
  );

  return new;
end;
$$;

create trigger reports_create_moderation_case
  after insert on public.reports
  for each row execute function public.create_moderation_case_for_report();

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
          and age_eligible = true
          and profile_completed_at is not null
        then coalesce(discovery_enabled_at, now())
        else discovery_enabled_at
      end
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

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
      and account.age_eligible = true
      and account.profile_completed_at is not null
      and account.first_video_approved_at is not null
      and account.discovery_enabled_at is not null
  );
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

alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.account_status enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.user_consents enable row level security;
alter table public.user_devices enable row level security;
alter table public.profile_videos enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.admin_actions enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "private_profiles_select_own_or_admin"
  on public.private_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "private_profiles_insert_own"
  on public.private_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "private_profiles_update_own"
  on public.private_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "private_profiles_admin_all"
  on public.private_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "account_status_select_own_or_admin"
  on public.account_status for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "account_status_admin_all"
  on public.account_status for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "identity_verifications_select_own_or_admin"
  on public.identity_verifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "identity_verifications_admin_all"
  on public.identity_verifications for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "user_consents_select_own_or_admin"
  on public.user_consents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_consents_insert_own"
  on public.user_consents for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_consents_admin_all"
  on public.user_consents for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "user_devices_select_own_or_admin"
  on public.user_devices for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_devices_insert_own"
  on public.user_devices for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_devices_update_own"
  on public.user_devices for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_devices_delete_own"
  on public.user_devices for delete to authenticated
  using (user_id = auth.uid());

create policy "user_devices_admin_all"
  on public.user_devices for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profile_videos_select_own_or_admin"
  on public.profile_videos for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "profile_videos_insert_own_pending"
  on public.profile_videos for insert to authenticated
  with check (
    user_id = auth.uid()
    and moderation_status = 'pending'
    and storage_bucket = 'profile-videos'
  );

create policy "profile_videos_admin_all"
  on public.profile_videos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "blocks_select_own_or_admin"
  on public.blocks for select to authenticated
  using (
    blocker_user_id = auth.uid()
    or blocked_user_id = auth.uid()
    or public.is_admin()
  );

create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check (blocker_user_id = auth.uid());

create policy "blocks_update_own"
  on public.blocks for update to authenticated
  using (blocker_user_id = auth.uid())
  with check (blocker_user_id = auth.uid());

create policy "blocks_admin_all"
  on public.blocks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "reports_select_own_or_admin"
  on public.reports for select to authenticated
  using (reporter_user_id = auth.uid() or public.is_admin());

create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check (reporter_user_id = auth.uid());

create policy "reports_admin_all"
  on public.reports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "moderation_cases_admin_all"
  on public.moderation_cases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin_actions_admin_all"
  on public.admin_actions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profile_video_objects_select_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

create policy "profile_video_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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

create policy "profile_video_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.can_enter_discovery(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

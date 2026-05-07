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

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

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
    when current_account.identity_verified_at is null
      or current_account.age_eligible = false then
      case
        when current_account.onboarding_state = 'identity_verification' then 'identity_verification'::public.onboarding_state
        else 'phone'::public.onboarding_state
      end
    when current_account.profile_completed_at is null then 'profile'::public.onboarding_state
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

create or replace function public.complete_profile(
  p_display_name text,
  p_gender text default null,
  p_bio text default null
)
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

  if current_account.account_state <> 'active' then
    raise exception 'account is not active';
  end if;

  if current_account.identity_verified_at is null
    or current_account.age_eligible = false then
    raise exception 'identity verification is required';
  end if;

  update public.profiles
  set
    display_name = nullif(trim(p_display_name), ''),
    gender = nullif(trim(p_gender), ''),
    bio = nullif(trim(p_bio), '')
  where profiles.id = current_user_id;

  update public.account_status
  set
    profile_completed_at = coalesce(profile_completed_at, now()),
    onboarding_state = case
      when onboarding_state = 'profile' then 'first_video'::public.onboarding_state
      else onboarding_state
    end
  where account_status.user_id = current_user_id
  returning * into updated_account;

  return updated_account;
end;
$$;

grant execute on function public.get_my_eligibility() to authenticated;
grant execute on function public.accept_required_consents(text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.complete_profile(text, text, text) to authenticated;

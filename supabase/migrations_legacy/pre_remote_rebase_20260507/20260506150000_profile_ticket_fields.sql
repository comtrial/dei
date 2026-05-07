alter table public.profiles
  add column if not exists region_sido text,
  add column if not exists region_sigungu text,
  add column if not exists mbti text,
  add column if not exists profile_image_path text,
  add column if not exists interest_categories text[] not null default '{}'::text[],
  add column if not exists interest_tags text[] not null default '{}'::text[];

alter table public.profiles
  add constraint profiles_region_sido_length check (
    region_sido is null
    or char_length(trim(region_sido)) between 1 and 40
  ),
  add constraint profiles_region_sigungu_length check (
    region_sigungu is null
    or char_length(trim(region_sigungu)) between 1 and 40
  ),
  add constraint profiles_mbti_length check (
    mbti is null
    or char_length(trim(mbti)) between 1 and 20
  ),
  add constraint profiles_profile_image_path_length check (
    profile_image_path is null
    or char_length(trim(profile_image_path)) <= 512
  ),
  add constraint profiles_interest_tags_count check (
    coalesce(array_length(interest_tags, 1), 0) between 0 and 10
  );

drop function if exists public.complete_profile(text, text, text, date);

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

  if current_account.identity_verified_at is null then
    raise exception 'identity verification is required';
  end if;

  if coalesce(array_length(p_interest_tags, 1), 0) < 3
    or coalesce(array_length(p_interest_tags, 1), 0) > 10 then
    raise exception 'interest tags must be between 3 and 10';
  end if;

  update public.profiles
  set
    display_name = nullif(trim(p_display_name), ''),
    gender = nullif(trim(p_gender), ''),
    bio = nullif(trim(p_bio), ''),
    region_sido = nullif(trim(p_region_sido), ''),
    region_sigungu = nullif(trim(p_region_sigungu), ''),
    mbti = nullif(trim(p_mbti), ''),
    profile_image_path = nullif(trim(p_profile_image_path), ''),
    interest_categories = coalesce(p_interest_categories, '{}'::text[]),
    interest_tags = coalesce(p_interest_tags, '{}'::text[])
  where profiles.id = current_user_id;

  update public.private_profiles
  set
    birth_date = p_birth_date,
    updated_at = now()
  where private_profiles.user_id = current_user_id;

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

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

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

grant execute on function public.accept_required_consents(
  text,
  text,
  text,
  text,
  boolean,
  boolean
) to authenticated;

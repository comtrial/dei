drop function if exists public.complete_profile(text, text, text);

create or replace function public.complete_profile(
  p_display_name text,
  p_gender text default null,
  p_bio text default null,
  p_birth_date date default null
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

grant execute on function public.complete_profile(text, text, text, date) to authenticated;

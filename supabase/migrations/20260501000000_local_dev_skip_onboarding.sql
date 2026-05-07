create or replace function public.skip_local_dev_onboarding()
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  result public.account_status;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select email into current_email
    from auth.users
   where id = current_user_id;

  if current_email is distinct from 'dev@dei.local' then
    raise exception 'skip_local_dev_onboarding is only available for dev@dei.local';
  end if;

  -- 1. 약관 동의
  insert into public.user_consents (
    user_id, terms_version, privacy_version,
    community_guidelines_version, age_policy_version
  ) values (
    current_user_id, '2026-04-25', '2026-04-25', '2026-04-25', '2026-04-25'
  ) on conflict do nothing;

  -- 2. 본인인증 (complete_local_dev_identity_verification 와 동일)
  insert into public.identity_verifications (
    user_id, provider, provider_verification_id, status,
    phone_country_code, phone_hash, adult_verified, birth_year,
    verified_at, provider_metadata
  ) values (
    current_user_id, 'portone', 'local-dev-' || current_user_id::text, 'verified',
    '+82', 'local-dev-phone-hash', true, 1990,
    now(), '{"source":"local_dev"}'::jsonb
  ) on conflict (provider, provider_verification_id)
    where provider_verification_id is not null
    do update set status = 'verified', adult_verified = true, verified_at = now();

  update public.private_profiles
     set phone_country_code = '+82',
         phone_hash = 'local-dev-phone-hash',
         updated_at = now()
   where user_id = current_user_id;

  -- 3. 프로필 + 영상 onboarding 전부 완료 처리
  insert into public.account_status (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.account_status
     set identity_verified_at    = coalesce(identity_verified_at, now()),
         age_verified_at         = coalesce(age_verified_at, now()),
         age_eligible            = true,
         profile_completed_at    = coalesce(profile_completed_at, now()),
         first_video_uploaded_at = coalesce(first_video_uploaded_at, now()),
         first_video_approved_at = coalesce(first_video_approved_at, now()),
         onboarding_state        = 'complete'::public.onboarding_state,
         updated_at              = now()
   where user_id = current_user_id
   returning * into result;

  return result;
end;
$$;

grant execute on function public.skip_local_dev_onboarding() to authenticated;

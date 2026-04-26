do $$
declare
  dev_user_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  select id
    into dev_user_id
    from auth.users
    where email = 'dev@dei.local'
    limit 1;

  if dev_user_id is null then
    dev_user_id := '00000000-0000-4000-8000-000000000001';

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      dev_user_id,
      'authenticated',
      'authenticated',
      'dev@dei.local',
      crypt('dei-local-dev-password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      false,
      false
    );
  else
    update auth.users
       set encrypted_password = crypt('dei-local-dev-password', gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
           updated_at = now()
     where id = dev_user_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    '00000000-0000-4000-8000-000000000002',
    dev_user_id,
    dev_user_id::text,
    jsonb_build_object(
      'sub',
      dev_user_id::text,
      'email',
      'dev@dei.local',
      'email_verified',
      true,
      'phone_verified',
      false
    ),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();
end $$;

create or replace function public.complete_local_dev_identity_verification()
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  updated_account public.account_status;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select email
    into current_email
    from auth.users
    where id = current_user_id;

  if current_email is distinct from 'dev@dei.local' then
    raise exception 'local dev verification is only available for dev@dei.local';
  end if;

  insert into public.identity_verifications (
    user_id,
    provider,
    provider_verification_id,
    status,
    phone_country_code,
    phone_hash,
    adult_verified,
    birth_year,
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
    true,
    1990,
    now(),
    '{"source":"local_dev"}'::jsonb
  )
  on conflict (provider, provider_verification_id)
  where provider_verification_id is not null
  do update
    set status = 'verified',
        adult_verified = true,
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

  insert into public.account_status (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.account_status
     set identity_verified_at = coalesce(identity_verified_at, now()),
         age_verified_at = coalesce(age_verified_at, now()),
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

grant execute on function public.complete_local_dev_identity_verification() to authenticated;

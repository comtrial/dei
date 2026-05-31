alter table public.profile
  add column if not exists onboarding_completed_at timestamptz;

update public.profile
set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, now())
where onboarding_completed_at is null
  and is_adult = true
  and nullif(trim(nickname), '') is not null
  and nullif(trim(photo_url), '') is not null;

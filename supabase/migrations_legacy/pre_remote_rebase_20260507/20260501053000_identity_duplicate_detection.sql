alter table public.private_profiles
  add column if not exists ci_hash text,
  add column if not exists di_hash text;

alter table public.identity_verifications
  add column if not exists ci_hash text,
  add column if not exists di_hash text;

create unique index if not exists private_profiles_ci_hash_unique
  on public.private_profiles(ci_hash)
  where ci_hash is not null;

create index if not exists private_profiles_di_hash_idx
  on public.private_profiles(di_hash)
  where di_hash is not null;

create index if not exists private_profiles_phone_hash_idx
  on public.private_profiles(phone_hash)
  where phone_hash is not null;

create index if not exists identity_verifications_ci_hash_idx
  on public.identity_verifications(ci_hash)
  where ci_hash is not null;

create index if not exists identity_verifications_di_hash_idx
  on public.identity_verifications(di_hash)
  where di_hash is not null;

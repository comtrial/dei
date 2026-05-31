-- S02 terms agreement record.
create table if not exists public.terms_agreement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  service_terms boolean not null default false,
  privacy_policy boolean not null default false,
  location_collection boolean not null default false,
  marketing_opt_in boolean not null default false,
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, terms_version)
);

drop trigger if exists terms_agreement_set_updated_at on public.terms_agreement;
create trigger terms_agreement_set_updated_at
  before update on public.terms_agreement
  for each row execute function public.set_updated_at();

alter table public.terms_agreement enable row level security;

drop policy if exists terms_agreement_all_self on public.terms_agreement;
create policy terms_agreement_all_self on public.terms_agreement
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

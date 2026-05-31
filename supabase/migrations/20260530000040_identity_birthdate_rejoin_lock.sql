-- B flow alignment: S04/S19 birthdate lock + S20 30-day same-CI rejoin lock.
--
-- `profile.birth_date` stores the PortOne-confirmed date used for locked display.
-- `identity_rejoin_lock` survives auth user deletion so a withdrawn CI cannot
-- immediately create a new account.

alter table public.profile
  add column if not exists birth_date date;

create table if not exists public.identity_rejoin_lock (
  id uuid primary key default gen_random_uuid(),
  ci_hash text not null,
  user_id uuid,
  locked_until timestamptz not null,
  reason text not null default 'withdraw' check (reason in ('withdraw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ci_hash, reason)
);

create index if not exists identity_rejoin_lock_ci_until_idx
  on public.identity_rejoin_lock(ci_hash, locked_until desc);

alter table public.identity_rejoin_lock enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'identity_rejoin_lock_set_updated_at'
  ) then
    create trigger identity_rejoin_lock_set_updated_at
      before update on public.identity_rejoin_lock
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.profile
  add column if not exists nickname_changed_at timestamptz;

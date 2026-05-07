-- logs table: user video clips
create table if not exists public.logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  video_url    text not null,
  hour_slot    smallint not null check (hour_slot >= 0 and hour_slot <= 23),
  duration_sec smallint not null,
  검수_YN      char(1) not null default 'N' check (검수_YN in ('Y', 'N')),
  검수_상태    text not null default 'PENDING' check (검수_상태 in ('PENDING', 'APPROVED', 'REJECTED')),
  recorded_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

alter table public.logs enable row level security;

create policy "users can insert own logs"
  on public.logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can read own logs"
  on public.logs for select
  to authenticated
  using (user_id = auth.uid());

-- daily_logs table: aggregated daily status per user
create table if not exists public.daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  status     text not null default 'INCOMPLETE' check (status in ('INCOMPLETE', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.daily_logs enable row level security;

create policy "users can read own daily logs"
  on public.daily_logs for select
  to authenticated
  using (user_id = auth.uid());

-- recalculate_daily_log: called after each log insert
create or replace function public.recalculate_daily_log(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_distinct_slots integer;
  v_status text;
begin
  select count(distinct hour_slot)
  into v_distinct_slots
  from public.logs
  where user_id = p_user_id
    and recorded_at::date = current_date;

  v_status := case when v_distinct_slots >= 3 then 'COMPLETED' else 'INCOMPLETE' end;

  insert into public.daily_logs (user_id, log_date, status)
  values (p_user_id, current_date, v_status)
  on conflict (user_id, log_date)
  do update set status = excluded.status, updated_at = now();
end;
$$;

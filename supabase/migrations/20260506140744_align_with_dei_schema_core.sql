
-- ============================================================
-- DEI Admin Console — Aligned with dei repo docs/DB_스키마.md
-- ============================================================
-- Core user-facing tables: logs / daily_logs / curation_pool / likes
-- (mirrors dei repo migrations: 20260503000001_create_logs_table.sql,
--  20260503000002_create_curation_pool.sql, 20260503000003_likes_and_pool_rls.sql)

create extension if not exists pgcrypto;

-- ---------- logs ----------
create table public.logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  video_url     text not null,
  hour_slot     smallint not null check (hour_slot between 0 and 23),
  duration_sec  smallint not null,
  "검수_YN"     char(1) not null default 'N' check ("검수_YN" in ('Y','N')),
  "검수_상태"   text    not null default 'PENDING' check ("검수_상태" in ('PENDING','APPROVED','REJECTED')),
  recorded_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index logs_user_idx on public.logs(user_id);
create index logs_review_idx on public.logs("검수_YN", created_at);
create index logs_recorded_idx on public.logs(recorded_at desc);

alter table public.logs enable row level security;
create policy "users can insert own logs" on public.logs
  for insert with check (user_id = auth.uid());
create policy "users can read own logs" on public.logs
  for select using (user_id = auth.uid());

-- ---------- daily_logs ----------
create table public.daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  status     text not null default 'INCOMPLETE' check (status in ('INCOMPLETE','COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create index daily_logs_user_idx on public.daily_logs(user_id);
alter table public.daily_logs enable row level security;
create policy "users can read own daily logs" on public.daily_logs
  for select using (user_id = auth.uid());

-- ---------- curation_pool ----------
create table public.curation_pool (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_id     uuid not null references public.logs(id) on delete cascade,
  pool_date  date not null,
  "검수_YN"  char(1) not null default 'N' check ("검수_YN" in ('Y','N')),
  "차단_YN"  char(1) not null default 'N' check ("차단_YN" in ('Y','N')),
  video_path text,
  created_at timestamptz not null default now(),
  unique (user_id, pool_date)
);
create index curation_pool_date_idx on public.curation_pool(pool_date);
alter table public.curation_pool enable row level security;
create policy "authenticated users can read curation pool" on public.curation_pool
  for select using (true);

-- ---------- likes ----------
create table public.likes (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id   uuid not null references auth.users(id) on delete cascade,
  liked_at     timestamptz not null,
  created_at   timestamptz not null default now()
);
create index likes_from_idx on public.likes(from_user_id);
create index likes_to_idx on public.likes(to_user_id);
alter table public.likes enable row level security;
create policy "users can insert own likes" on public.likes
  for insert with check (from_user_id = auth.uid());
create policy "users can read own likes" on public.likes
  for select using (from_user_id = auth.uid());

-- ---------- recalculate_daily_log RPC ----------
create or replace function public.recalculate_daily_log(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_distinct_hours int;
begin
  select count(distinct hour_slot)
    into v_distinct_hours
    from public.logs
   where user_id = p_user_id
     and (recorded_at at time zone 'Asia/Seoul')::date = v_today;

  insert into public.daily_logs (user_id, log_date, status, updated_at)
  values (p_user_id, v_today,
          case when v_distinct_hours >= 3 then 'COMPLETED' else 'INCOMPLETE' end,
          now())
  on conflict (user_id, log_date) do update
    set status = excluded.status,
        updated_at = now();
end $$;
;

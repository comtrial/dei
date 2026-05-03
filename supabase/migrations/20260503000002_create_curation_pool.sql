-- curation_pool: 홈 화면 큐레이션 대상 풀
create table if not exists public.curation_pool (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  log_id      uuid not null references public.logs(id) on delete cascade,
  pool_date   date not null,
  검수_YN     char(1) not null default 'N' check (검수_YN in ('Y', 'N')),
  차단_YN     char(1) not null default 'N' check (차단_YN in ('Y', 'N')),
  created_at  timestamptz not null default now(),
  unique (user_id, pool_date)
);

alter table public.curation_pool enable row level security;

-- 본인 외 Y/N 상태 풀 읽기 허용 (홈 화면 큐레이션 조회용)
create policy "authenticated users can read curation pool"
  on public.curation_pool for select
  to authenticated
  using (true);

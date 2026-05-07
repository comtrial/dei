-- likes: 하루 1회 좋아요
create table if not exists public.likes (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id   uuid not null references auth.users(id) on delete cascade,
  liked_at     timestamptz not null,
  created_at   timestamptz not null default now()
);

alter table public.likes enable row level security;

create policy "users can insert own likes"
  on public.likes for insert
  to authenticated
  with check (from_user_id = auth.uid());

create policy "users can read own likes"
  on public.likes for select
  to authenticated
  using (from_user_id = auth.uid());

-- curation_pool에 video_path 추가 (Storage 경로 — 퍼블릭 버킷 URL 생성에 사용)
alter table public.curation_pool
  add column if not exists video_path text;

-- 큐레이션 풀에 등록된 로그는 다른 인증 유저도 읽을 수 있도록 허용
create policy "users can read pool logs"
  on public.logs for select
  to authenticated
  using (
    id in (
      select log_id from public.curation_pool
      where 검수_YN = 'Y' and 차단_YN = 'N'
    )
  );

-- 큐레이션 풀 유저의 프로필(닉네임)은 인증 유저 전체가 읽을 수 있음
create policy "users can read pool profiles"
  on public.profiles for select
  to authenticated
  using (true);

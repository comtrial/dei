-- 20260602000010_matching_schema.sql
-- 매칭 엔진 스키마. 앱 배포 비의존 — 매칭 설정은 match_config 로 런타임 토글.
-- 명세: docs/matching-spec/ALGORITHM-SPEC.md §2.

-- (a) 5인 팀 허용 (POLICY.team.maxMembers=5 정합, 8셀=5+3). 기존 1..4 무손실.
alter table public.team drop constraint if exists team_target_size_check;
alter table public.team add constraint team_target_size_check
  check (target_size between 1 and 5);

-- (b) 합성팀 식별 (혼자 동적 merge)
alter table public.team add column if not exists kind text not null default 'user'
  check (kind in ('user','synthetic'));
create index if not exists team_synthetic_idx on public.team(kind) where kind = 'synthetic';

-- (c) 매칭 엔진 큐 컬럼 (required_gender 만. last_tried_at 불필요 — sweep 없음, 이벤트 기반)
alter table public.match_queue add column if not exists required_gender text
  check (required_gender in ('male','female'));

-- (d) 런타임 설정 테이블 (앱 재빌드 없이 매칭 동작 토글)
create table if not exists public.match_config (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.match_config(key, value) values
  ('automation', '"manual_admin_curation"'::jsonb),     -- manual_admin_curation | auto_immediate | auto_scored
  ('tier1_minutes', '30'::jsonb),
  ('tier2_minutes', '120'::jsonb),
  ('boost_minutes', '15'::jsonb),
  ('side_max', '5'::jsonb),
  ('cell_cap', '8'::jsonb)
on conflict (key) do nothing;
alter table public.match_config enable row level security;
-- 읽기는 authenticated(클라가 자동매칭 여부 알 필요 시), 쓰기는 service_role/admin 만.
create policy match_config_select on public.match_config for select to authenticated using (true);

-- 헬퍼: config 값 읽기
create or replace function public.match_cfg_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.match_config where key = p_key), p_default);
$$;
create or replace function public.match_cfg_text(p_key text, p_default text)
returns text language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}') from public.match_config where key = p_key), p_default);
$$;


-- ============================================================
-- Admin-console-only extension tables
-- These are NOT in dei core schema yet; admin console owns them.
-- ============================================================

-- ---------- profiles (회원 메타) ----------
-- 닉네임/생년월일/성별/지역/MBTI/intro/사진 — 회원 검색·표시용.
-- dei 측에서 추후 정식 profiles 테이블 만들면 그쪽으로 합치면 됨.
create table public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  nickname         text,
  phone            text,
  birth_date       date,
  gender           text check (gender in ('M','F')),
  region_sido      text,
  region_sigungu   text,
  intro            text,
  mbti             text,
  photo_url        text,
  "사진_검수_YN"   char(1) not null default 'N' check ("사진_검수_YN" in ('Y','N','R')),
  "회원상태"       text not null default 'ACTIVE' check ("회원상태" in ('ACTIVE','SUSPENDED','WITHDRAWN')),
  "차단_YN"        char(1) not null default 'N' check ("차단_YN" in ('Y','N')),
  blocked_until    timestamptz,
  suspend_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_status_idx  on public.profiles("회원상태");
create index profiles_blocked_idx on public.profiles("차단_YN");
create index profiles_photo_review_idx on public.profiles("사진_검수_YN");
create index profiles_created_idx on public.profiles(created_at desc);

-- ---------- review_history (검수 이력) ----------
create table public.review_history (
  id           uuid primary key default gen_random_uuid(),
  log_id       uuid references public.logs(id) on delete cascade,
  target_user  uuid references auth.users(id) on delete set null,
  target_type  text not null check (target_type in ('LOG','PHOTO')),
  action       text not null check (action in ('APPROVE','REJECT','HOLD')),
  reason       text,
  operator_id  uuid,
  operator_email text,
  created_at   timestamptz not null default now()
);
create index review_history_log_idx on public.review_history(log_id);
create index review_history_created_idx on public.review_history(created_at desc);

-- ---------- reports (신고) ----------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reported_id     uuid not null references auth.users(id) on delete cascade,
  log_id          uuid references public.logs(id) on delete set null,
  reason          text not null,
  reason_category text not null check (reason_category in ('INAPPROPRIATE','FRAUD','ABUSE','OTHER')),
  description     text,
  "처리상태"      text not null default 'PENDING' check ("처리상태" in ('PENDING','DONE','IGNORED')),
  action_taken    text check (action_taken in ('BLOCK','WARN','IGNORE','HIDE_VIDEO')),
  block_days      int,
  operator_comment text,
  operator_id     uuid,
  operator_email  text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index reports_status_idx   on public.reports("처리상태", created_at);
create index reports_reported_idx on public.reports(reported_id);
create index reports_reporter_idx on public.reports(reporter_id);

-- ---------- payments (결제) ----------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  product_type    text not null default 'REFRESH',
  amount          int not null,
  currency        text not null default 'KRW',
  "결제상태"      text not null default 'PENDING' check ("결제상태" in ('PENDING','SUCCESS','FAILED')),
  payment_method  text,
  external_tx_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index payments_status_idx on public.payments("결제상태", created_at);
create index payments_user_idx   on public.payments(user_id);

-- ---------- sms_log ----------
create table public.sms_log (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  user_id     uuid references auth.users(id) on delete set null,
  send_count  int not null default 1,
  ip_address  text,
  result      text not null default 'SUCCESS',
  created_at  timestamptz not null default now()
);
create index sms_log_phone_idx   on public.sms_log(phone, created_at);
create index sms_log_created_idx on public.sms_log(created_at desc);

-- ---------- admins (운영자) ----------
create table public.admins (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete cascade,
  email         text unique not null,
  name          text,
  role          text not null default 'OPERATOR' check (role in ('SUPER','OPERATOR','VIEWER')),
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------- audit_log (운영 로그) ----------
create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  operator_id     uuid references public.admins(id) on delete set null,
  operator_email  text,
  action          text not null,
  target_type     text,
  target_id       uuid,
  meta            jsonb,
  created_at      timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);
create index audit_log_action_idx  on public.audit_log(action);

-- ---------- updated_at triggers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
for each row execute function public.set_updated_at();

-- ---------- Enable RLS + admin policies ----------
alter table public.profiles       enable row level security;
alter table public.review_history enable row level security;
alter table public.reports        enable row level security;
alter table public.payments       enable row level security;
alter table public.sms_log        enable row level security;
alter table public.admins         enable row level security;
alter table public.audit_log      enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.auth_user_id = auth.uid() and a.is_active = true
  );
$$;

-- Profiles: user can see own, admin sees all
create policy profiles_self_or_admin on public.profiles for select
  using (auth.uid() = user_id or public.is_admin());
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_self_insert on public.profiles for insert
  with check (auth.uid() = user_id);
create policy profiles_self_update on public.profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy review_history_admin_all on public.review_history for all using (public.is_admin()) with check (public.is_admin());
create policy reports_admin_all       on public.reports        for all using (public.is_admin()) with check (public.is_admin());
create policy payments_admin_select   on public.payments       for select using (public.is_admin());
create policy sms_log_admin_select    on public.sms_log        for select using (public.is_admin());
create policy admins_self_or_admin    on public.admins         for select using (auth.uid() = auth_user_id or public.is_admin());
create policy audit_admin_all         on public.audit_log      for all using (public.is_admin()) with check (public.is_admin());

-- Admin can also read/update logs for review
create policy logs_admin_select on public.logs for select using (public.is_admin());
create policy logs_admin_update on public.logs for update using (public.is_admin()) with check (public.is_admin());
create policy curation_pool_admin_all on public.curation_pool for all using (public.is_admin()) with check (public.is_admin());
;

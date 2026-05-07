
-- ============================================================
-- DEI Admin Console — Initial schema
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type member_status as enum ('ACTIVE','SUSPENDED','WITHDRAWN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_yn as enum ('N','Y','R');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('PENDING','APPROVED','REJECTED','HOLD');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('PENDING','DONE','IGNORED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_action as enum ('BLOCK','WARN','IGNORE','HIDE_VIDEO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('PENDING','SUCCESS','FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_role as enum ('SUPER','OPERATOR','VIEWER');
exception when duplicate_object then null; end $$;

-- ---------- members ----------
create table if not exists public.members (
  id uuid primary key default uuid_generate_v4(),
  phone text unique not null,
  nickname text,
  birth_date date,
  gender text check (gender in ('M','F')),
  region_sido text,
  region_sigungu text,
  intro text,
  mbti text,
  photo_url text,
  photo_review_yn review_yn not null default 'N',
  status member_status not null default 'ACTIVE',
  blocked_yn boolean not null default false,
  blocked_until timestamptz,
  suspend_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists members_status_idx on public.members(status);
create index if not exists members_blocked_idx on public.members(blocked_yn);
create index if not exists members_photo_review_idx on public.members(photo_review_yn);
create index if not exists members_created_at_idx on public.members(created_at desc);

-- ---------- interests ----------
create table if not exists public.interests (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references public.members(id) on delete cascade,
  category text not null,
  tag text not null,
  created_at timestamptz not null default now()
);
create index if not exists interests_member_idx on public.interests(member_id);

-- ---------- logs (영상 로그) ----------
create table if not exists public.logs (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references public.members(id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  duration_sec int not null check (duration_sec between 1 and 30),
  hour_slot int not null check (hour_slot between 0 and 23),
  log_date date not null,
  review_yn review_yn not null default 'N',
  review_status review_status not null default 'PENDING',
  reject_reason text,
  is_first_log boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists logs_review_idx on public.logs(review_yn, created_at);
create index if not exists logs_member_idx on public.logs(member_id);
create index if not exists logs_log_date_idx on public.logs(log_date);

-- ---------- review_history (검수 이력) ----------
create table if not exists public.review_history (
  id uuid primary key default uuid_generate_v4(),
  log_id uuid references public.logs(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  target_type text not null check (target_type in ('LOG','PHOTO')),
  action text not null check (action in ('APPROVE','REJECT','HOLD')),
  reason text,
  operator_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists review_history_log_idx on public.review_history(log_id);
create index if not exists review_history_operator_idx on public.review_history(operator_id);

-- ---------- reports (신고) ----------
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.members(id) on delete cascade,
  reported_id uuid not null references public.members(id) on delete cascade,
  log_id uuid references public.logs(id) on delete set null,
  reason text not null,
  reason_category text not null check (reason_category in ('INAPPROPRIATE','FRAUD','ABUSE','OTHER')),
  description text,
  status report_status not null default 'PENDING',
  action_taken report_action,
  block_days int,
  operator_comment text,
  operator_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports(status, created_at);
create index if not exists reports_reported_idx on public.reports(reported_id);
create index if not exists reports_reporter_idx on public.reports(reporter_id);

-- ---------- payments (결제) ----------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references public.members(id) on delete cascade,
  product_type text not null default 'REFRESH',
  amount int not null,
  currency text not null default 'KRW',
  status payment_status not null default 'PENDING',
  payment_method text,
  external_tx_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_status_idx on public.payments(status, created_at);
create index if not exists payments_member_idx on public.payments(member_id);

-- ---------- sms_log ----------
create table if not exists public.sms_log (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  member_id uuid references public.members(id) on delete set null,
  send_count int not null default 1,
  ip_address text,
  result text not null default 'SUCCESS',
  created_at timestamptz not null default now()
);
create index if not exists sms_log_phone_idx on public.sms_log(phone, created_at);
create index if not exists sms_log_created_idx on public.sms_log(created_at desc);

-- ---------- admins (운영자) ----------
create table if not exists public.admins (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique,
  email text unique not null,
  name text,
  role admin_role not null default 'OPERATOR',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- audit_log (운영 로그) ----------
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid references public.admins(id) on delete set null,
  operator_email text,
  action text not null,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_action_idx on public.audit_log(action);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_members_updated on public.members;
create trigger trg_members_updated before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists trg_logs_updated on public.logs;
create trigger trg_logs_updated before update on public.logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
for each row execute function public.set_updated_at();
;

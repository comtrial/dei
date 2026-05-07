
-- Drop previously created (placeholder) tables to realign with dei docs/DB_스키마.md
drop table if exists public.audit_log cascade;
drop table if exists public.admins cascade;
drop table if exists public.sms_log cascade;
drop table if exists public.payments cascade;
drop table if exists public.reports cascade;
drop table if exists public.review_history cascade;
drop table if exists public.interests cascade;
drop table if exists public.logs cascade;
drop table if exists public.members cascade;

drop type if exists member_status cascade;
drop type if exists review_yn cascade;
drop type if exists review_status cascade;
drop type if exists report_status cascade;
drop type if exists report_action cascade;
drop type if exists payment_status cascade;
drop type if exists admin_role cascade;
;

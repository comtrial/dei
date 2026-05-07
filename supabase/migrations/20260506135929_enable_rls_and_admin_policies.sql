
-- RLS for admin console: only authenticated admin users (service role bypasses)
alter table public.members enable row level security;
alter table public.interests enable row level security;
alter table public.logs enable row level security;
alter table public.review_history enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;
alter table public.sms_log enable row level security;
alter table public.admins enable row level security;
alter table public.audit_log enable row level security;

-- Helper: check if current authenticated user is an active admin
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.auth_user_id = auth.uid() and a.is_active = true
  );
$$;

-- Admin can read everything
do $$ begin
  drop policy if exists members_admin_select on public.members;
  drop policy if exists members_admin_update on public.members;
  drop policy if exists logs_admin_all on public.logs;
  drop policy if exists reports_admin_all on public.reports;
  drop policy if exists payments_admin_select on public.payments;
  drop policy if exists sms_log_admin_select on public.sms_log;
  drop policy if exists interests_admin_select on public.interests;
  drop policy if exists review_history_admin_all on public.review_history;
  drop policy if exists admins_self_select on public.admins;
  drop policy if exists audit_admin_all on public.audit_log;
end $$;

create policy members_admin_select on public.members for select using (public.is_admin());
create policy members_admin_update on public.members for update using (public.is_admin()) with check (public.is_admin());
create policy logs_admin_all on public.logs for all using (public.is_admin()) with check (public.is_admin());
create policy reports_admin_all on public.reports for all using (public.is_admin()) with check (public.is_admin());
create policy payments_admin_select on public.payments for select using (public.is_admin());
create policy sms_log_admin_select on public.sms_log for select using (public.is_admin());
create policy interests_admin_select on public.interests for select using (public.is_admin());
create policy review_history_admin_all on public.review_history for all using (public.is_admin()) with check (public.is_admin());
create policy admins_self_select on public.admins for select using (auth.uid() = auth_user_id or public.is_admin());
create policy audit_admin_all on public.audit_log for all using (public.is_admin()) with check (public.is_admin());
;

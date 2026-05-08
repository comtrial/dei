-- Paid refresh IAP foundation.
-- RevenueCat validates the store purchase; Supabase owns grant/consume state.

alter table public.payments
  add column if not exists provider text not null default 'revenuecat',
  add column if not exists product_id text,
  add column if not exists offering_id text,
  add column if not exists package_id text,
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists revenuecat_app_user_id text,
  add column if not exists revenuecat_original_app_user_id text,
  add column if not exists revenuecat_transaction_id text,
  add column if not exists revenuecat_event_id text,
  add column if not exists purchased_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create unique index if not exists payments_revenuecat_transaction_uidx
  on public.payments(provider, revenuecat_transaction_id)
  where revenuecat_transaction_id is not null;

create index if not exists payments_product_created_idx
  on public.payments(product_type, created_at desc);

create index if not exists payments_user_created_idx
  on public.payments(user_id, created_at desc);

create index if not exists payments_revenuecat_event_idx
  on public.payments(revenuecat_event_id)
  where revenuecat_event_id is not null;

create table if not exists public.revenuecat_webhook_events (
  id text primary key,
  event_type text not null,
  app_user_id text,
  original_app_user_id text,
  aliases text[] not null default '{}'::text[],
  transaction_id text,
  product_id text,
  environment text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists revenuecat_webhook_events_type_created_idx
  on public.revenuecat_webhook_events(event_type, created_at desc);

create index if not exists revenuecat_webhook_events_app_user_created_idx
  on public.revenuecat_webhook_events(app_user_id, created_at desc)
  where app_user_id is not null;

create index if not exists revenuecat_webhook_events_transaction_idx
  on public.revenuecat_webhook_events(transaction_id)
  where transaction_id is not null;

create table if not exists public.refresh_item_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  product_id text not null,
  granted_count int not null default 1,
  remaining_count int not null default 1,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'CONSUMED', 'REVOKED')),
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refresh_item_grants_count_check
    check (granted_count > 0 and remaining_count >= 0 and remaining_count <= granted_count)
);

create unique index if not exists refresh_item_grants_payment_uidx
  on public.refresh_item_grants(payment_id);

create index if not exists refresh_item_grants_user_status_idx
  on public.refresh_item_grants(user_id, status, granted_at desc);

create table if not exists public.refresh_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid references public.refresh_item_grants(id) on delete set null,
  pool_date date not null default current_date,
  seen_user_ids uuid[] not null default '{}'::uuid[],
  candidate_user_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'SUCCESS' check (status in ('SUCCESS', 'FAILED')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refresh_redemptions_success_candidate_count_check
    check (status = 'FAILED' or cardinality(candidate_user_ids) = 3)
);

create index if not exists refresh_redemptions_user_created_idx
  on public.refresh_redemptions(user_id, created_at desc);

create index if not exists refresh_redemptions_grant_idx
  on public.refresh_redemptions(grant_id)
  where grant_id is not null;

drop trigger if exists trg_refresh_item_grants_updated on public.refresh_item_grants;
create trigger trg_refresh_item_grants_updated before update on public.refresh_item_grants
for each row execute function public.set_updated_at();

drop trigger if exists trg_refresh_redemptions_updated on public.refresh_redemptions;
create trigger trg_refresh_redemptions_updated before update on public.refresh_redemptions
for each row execute function public.set_updated_at();

alter table public.revenuecat_webhook_events enable row level security;
alter table public.refresh_item_grants enable row level security;
alter table public.refresh_redemptions enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists revenuecat_webhook_events_admin_select on public.revenuecat_webhook_events;
create policy revenuecat_webhook_events_admin_select on public.revenuecat_webhook_events
  for select to authenticated
  using (public.is_admin());

drop policy if exists refresh_item_grants_select_own_or_admin on public.refresh_item_grants;
create policy refresh_item_grants_select_own_or_admin on public.refresh_item_grants
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists refresh_redemptions_select_own_or_admin on public.refresh_redemptions;
create policy refresh_redemptions_select_own_or_admin on public.refresh_redemptions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create or replace function public.grant_refresh_item(
  p_user_id uuid,
  p_payment_id uuid,
  p_product_id text,
  p_granted_count int default 1
)
returns public.refresh_item_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  granted public.refresh_item_grants;
begin
  if p_user_id is null or p_payment_id is null then
    raise exception 'user id and payment id are required';
  end if;

  if trim(coalesce(p_product_id, '')) = '' then
    raise exception 'product id is required';
  end if;

  if p_granted_count < 1 then
    raise exception 'granted count must be positive';
  end if;

  insert into public.refresh_item_grants (
    user_id,
    payment_id,
    product_id,
    granted_count,
    remaining_count
  )
  values (
    p_user_id,
    p_payment_id,
    p_product_id,
    p_granted_count,
    p_granted_count
  )
  on conflict (payment_id) do nothing
  returning * into granted;

  if granted.id is null then
    select *
    into granted
    from public.refresh_item_grants
    where payment_id = p_payment_id;
  end if;

  return granted;
end;
$$;

create or replace function public.get_available_refresh_item_count(
  p_user_id uuid default auth.uid()
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_user_id uuid := coalesce(p_user_id, auth.uid());
  available_count int;
begin
  if target_user_id is null then
    raise exception 'user id is required';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and target_user_id <> auth.uid()
    and not public.is_admin()
  then
    raise exception 'not allowed';
  end if;

  select coalesce(sum(remaining_count), 0)::int
  into available_count
  from public.refresh_item_grants
  where user_id = target_user_id
    and status = 'AVAILABLE';

  return available_count;
end;
$$;

create or replace function public.record_refresh_redemption(
  p_user_id uuid,
  p_grant_id uuid default null,
  p_seen_user_ids uuid[] default '{}'::uuid[],
  p_candidate_user_ids uuid[] default '{}'::uuid[],
  p_status text default 'SUCCESS',
  p_failure_reason text default null
)
returns public.refresh_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text := upper(coalesce(p_status, 'SUCCESS'));
  grant_row public.refresh_item_grants;
  redemption public.refresh_redemptions;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  if normalized_status not in ('SUCCESS', 'FAILED') then
    raise exception 'unsupported refresh redemption status';
  end if;

  if normalized_status = 'SUCCESS' and cardinality(coalesce(p_candidate_user_ids, '{}'::uuid[])) <> 3 then
    raise exception 'successful refresh redemption requires exactly 3 candidates';
  end if;

  if normalized_status = 'SUCCESS' then
    if p_grant_id is null then
      raise exception 'grant id is required for successful refresh redemption';
    end if;

    select *
    into grant_row
    from public.refresh_item_grants
    where id = p_grant_id
      and user_id = p_user_id
    for update;

    if grant_row.id is null then
      raise exception 'refresh grant was not found';
    end if;

    if grant_row.status <> 'AVAILABLE' or grant_row.remaining_count < 1 then
      raise exception 'no available refresh item grant';
    end if;

    update public.refresh_item_grants
    set remaining_count = remaining_count - 1,
        status = case
          when remaining_count - 1 = 0 then 'CONSUMED'
          else 'AVAILABLE'
        end,
        consumed_at = case
          when remaining_count - 1 = 0 then now()
          else consumed_at
        end,
        updated_at = now()
    where id = p_grant_id
    returning * into grant_row;
  elsif p_grant_id is not null then
    select *
    into grant_row
    from public.refresh_item_grants
    where id = p_grant_id
      and user_id = p_user_id;

    if grant_row.id is null then
      raise exception 'refresh grant was not found';
    end if;
  end if;

  insert into public.refresh_redemptions (
    user_id,
    grant_id,
    seen_user_ids,
    candidate_user_ids,
    status,
    failure_reason
  )
  values (
    p_user_id,
    p_grant_id,
    coalesce(p_seen_user_ids, '{}'::uuid[]),
    coalesce(p_candidate_user_ids, '{}'::uuid[]),
    normalized_status,
    p_failure_reason
  )
  returning * into redemption;

  return redemption;
end;
$$;

create or replace function public.revoke_refresh_item_grant_for_payment(
  p_payment_id uuid,
  p_revoke_reason text default 'refund'
)
returns public.refresh_item_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row public.refresh_item_grants;
begin
  if p_payment_id is null then
    raise exception 'payment id is required';
  end if;

  update public.refresh_item_grants
  set status = case
        when remaining_count > 0 then 'REVOKED'
        else status
      end,
      remaining_count = 0,
      revoked_at = case
        when remaining_count > 0 then now()
        else revoked_at
      end,
      revoke_reason = coalesce(p_revoke_reason, revoke_reason),
      updated_at = now()
  where payment_id = p_payment_id
  returning * into grant_row;

  return grant_row;
end;
$$;

revoke all on function public.grant_refresh_item(uuid, uuid, text, int) from public;
revoke all on function public.grant_refresh_item(uuid, uuid, text, int) from anon;
revoke all on function public.grant_refresh_item(uuid, uuid, text, int) from authenticated;
grant execute on function public.grant_refresh_item(uuid, uuid, text, int) to service_role;

revoke all on function public.get_available_refresh_item_count(uuid) from public;
revoke all on function public.get_available_refresh_item_count(uuid) from anon;
grant execute on function public.get_available_refresh_item_count(uuid) to authenticated;
grant execute on function public.get_available_refresh_item_count(uuid) to service_role;

revoke all on function public.record_refresh_redemption(uuid, uuid, uuid[], uuid[], text, text) from public;
revoke all on function public.record_refresh_redemption(uuid, uuid, uuid[], uuid[], text, text) from anon;
revoke all on function public.record_refresh_redemption(uuid, uuid, uuid[], uuid[], text, text) from authenticated;
grant execute on function public.record_refresh_redemption(uuid, uuid, uuid[], uuid[], text, text) to service_role;

revoke all on function public.revoke_refresh_item_grant_for_payment(uuid, text) from public;
revoke all on function public.revoke_refresh_item_grant_for_payment(uuid, text) from anon;
revoke all on function public.revoke_refresh_item_grant_for_payment(uuid, text) from authenticated;
grant execute on function public.revoke_refresh_item_grant_for_payment(uuid, text) to service_role;

create or replace function public.transfer_existing_member_account(
  p_from_user_id uuid,
  p_to_user_id uuid
)
returns public.account_status
language plpgsql
security definer
set search_path = public
as $$
declare
  transferred_account public.account_status;
begin
  if p_from_user_id is null or p_to_user_id is null then
    raise exception 'source and target user ids are required';
  end if;

  if p_from_user_id = p_to_user_id then
    select *
    into transferred_account
    from public.account_status
    where user_id = p_to_user_id;

    return transferred_account;
  end if;

  if not exists (select 1 from auth.users where id = p_from_user_id) then
    raise exception 'source user was not found';
  end if;

  if not exists (select 1 from auth.users where id = p_to_user_id) then
    raise exception 'target user was not found';
  end if;

  if not exists (select 1 from public.private_profiles where user_id = p_from_user_id) then
    raise exception 'source private profile was not found';
  end if;

  delete from public.account_status where user_id = p_to_user_id;
  delete from public.profiles where user_id = p_to_user_id;
  delete from public.private_profiles where user_id = p_to_user_id;
  delete from public.user_devices where user_id = p_to_user_id;

  update public.profiles
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  insert into public.profiles (user_id)
  select p_to_user_id
  where not exists (
    select 1 from public.profiles where user_id = p_to_user_id
  );

  update public.private_profiles
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  update public.account_status
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id
  returning * into transferred_account;

  if transferred_account.user_id is null then
    insert into public.account_status (
      user_id,
      account_state,
      onboarding_state,
      identity_verified_at
    )
    values (
      p_to_user_id,
      'active'::public.account_state,
      'profile'::public.onboarding_state,
      now()
    )
    returning * into transferred_account;
  end if;

  update public.identity_verifications
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.user_consents
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  update public.user_devices
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.profile_videos
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.logs
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  update public.daily_logs
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.curation_pool
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  update public.likes
  set from_user_id = p_to_user_id
  where from_user_id = p_from_user_id;

  update public.likes
  set to_user_id = p_to_user_id
  where to_user_id = p_from_user_id;

  update public.payments
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.refresh_item_grants
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.refresh_redemptions
  set user_id = p_to_user_id,
      updated_at = now()
  where user_id = p_from_user_id;

  update public.refresh_redemptions
  set seen_user_ids = array_replace(seen_user_ids, p_from_user_id, p_to_user_id),
      candidate_user_ids = array_replace(candidate_user_ids, p_from_user_id, p_to_user_id),
      updated_at = now()
  where p_from_user_id = any(seen_user_ids)
     or p_from_user_id = any(candidate_user_ids);

  update public.sms_log
  set user_id = p_to_user_id
  where user_id = p_from_user_id;

  update public.reports
  set reporter_id = p_to_user_id
  where reporter_id = p_from_user_id;

  update public.reports
  set reported_id = p_to_user_id
  where reported_id = p_from_user_id;

  update public.blocks
  set blocker_user_id = p_to_user_id,
      updated_at = now()
  where blocker_user_id = p_from_user_id;

  update public.blocks
  set blocked_user_id = p_to_user_id,
      updated_at = now()
  where blocked_user_id = p_from_user_id;

  update public.moderation_cases
  set subject_user_id = p_to_user_id,
      updated_at = now()
  where subject_user_id = p_from_user_id;

  update public.moderation_cases
  set assigned_admin_id = p_to_user_id,
      updated_at = now()
  where assigned_admin_id = p_from_user_id;

  update public.admin_actions
  set actor_user_id = p_to_user_id
  where actor_user_id = p_from_user_id;

  update public.admin_actions
  set target_user_id = p_to_user_id
  where target_user_id = p_from_user_id;

  update public.review_history
  set target_user = p_to_user_id
  where target_user = p_from_user_id;

  update storage.objects
  set owner = p_to_user_id,
      owner_id = p_to_user_id::text
  where bucket_id in ('profile-images', 'profile-videos')
    and (
      owner = p_from_user_id
      or owner_id = p_from_user_id::text
    );

  return transferred_account;
end;
$$;

revoke all on function public.transfer_existing_member_account(uuid, uuid) from public;
revoke all on function public.transfer_existing_member_account(uuid, uuid) from anon;
revoke all on function public.transfer_existing_member_account(uuid, uuid) from authenticated;
grant execute on function public.transfer_existing_member_account(uuid, uuid) to service_role;

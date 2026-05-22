-- Separate "new 3 matching ticket" purchases from like-only heart balance.
-- Both still use the existing payment/grant ledger, but product_id now decides
-- whether a grant can be consumed by refresh or by paid likes.

create or replace function public.is_refresh_item_product(p_product_id text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_product_id, ''))) in (
    'dei_refresh_1',
    'dei_match_3',
    'dei_matching_3'
  )
  or lower(trim(coalesce(p_product_id, ''))) like '%refresh%'
  or lower(trim(coalesce(p_product_id, ''))) like '%match_3%'
  or lower(trim(coalesce(p_product_id, ''))) like '%matching_3%';
$$;

create or replace function public.is_heart_product(p_product_id text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_product_id, ''))) in (
    'dei_heart_1',
    'dei_hearts_1'
  )
  or lower(trim(coalesce(p_product_id, ''))) like '%heart%';
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
    and status = 'AVAILABLE'
    and public.is_refresh_item_product(product_id);

  return available_count;
end;
$$;

create or replace function public.get_available_heart_count(
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
    and status = 'AVAILABLE'
    and public.is_heart_product(product_id);

  return available_count;
end;
$$;

drop function if exists public.consume_refresh_item(uuid[]);

create or replace function public.consume_refresh_item(
  p_seen_user_ids uuid[] default '{}'::uuid[]
)
returns table (
  pool_id uuid,
  user_id uuid,
  log_id uuid,
  video_path text,
  video_url text,
  thumbnail_path text,
  display_name text,
  gender text,
  redemption_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_gender text;
  target_gender text;
  effective_pool_date date := case
    when extract(hour from now() at time zone 'Asia/Seoul') < 12
      then ((now() at time zone 'Asia/Seoul')::date - 1)
    else (now() at time zone 'Asia/Seoul')::date
  end;
  normalized_seen_user_ids uuid[] := coalesce(p_seen_user_ids, '{}'::uuid[]);
  selected_user_ids uuid[];
  selected_grant public.refresh_item_grants;
  selected_redemption public.refresh_redemptions;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select profiles.gender into current_user_gender
  from public.profiles
  where profiles.user_id = current_user_id;

  if current_user_gender not in ('M', 'F') then
    raise exception 'NO_CANDIDATES';
  end if;

  target_gender := case when current_user_gender = 'M' then 'F' else 'M' end;

  select *
  into selected_grant
  from public.refresh_item_grants
  where refresh_item_grants.user_id = current_user_id
    and refresh_item_grants.status = 'AVAILABLE'
    and refresh_item_grants.remaining_count > 0
    and public.is_refresh_item_product(refresh_item_grants.product_id)
  order by refresh_item_grants.granted_at asc
  for update skip locked
  limit 1;

  if selected_grant.id is null then
    raise exception 'NO_AVAILABLE_REFRESH_ITEM';
  end if;

  select coalesce(array_agg(candidate.user_id), '{}'::uuid[])
  into selected_user_ids
  from (
    select curation_pool.user_id
    from public.curation_pool
    join public.profiles on profiles.user_id = curation_pool.user_id
    where curation_pool.pool_date = effective_pool_date
      and curation_pool.user_id <> current_user_id
      and curation_pool."검수_YN" = 'Y'
      and curation_pool."차단_YN" = 'N'
      and profiles.gender = target_gender
      and not curation_pool.user_id = any(normalized_seen_user_ids)
    order by random()
    limit 3
  ) candidate;

  if cardinality(selected_user_ids) < 3 then
    perform public.record_refresh_redemption(
      current_user_id,
      selected_grant.id,
      normalized_seen_user_ids,
      '{}'::uuid[],
      'FAILED',
      'NO_CANDIDATES'
    );

    raise exception 'NO_CANDIDATES';
  end if;

  selected_redemption := public.record_refresh_redemption(
    current_user_id,
    selected_grant.id,
    normalized_seen_user_ids,
    selected_user_ids,
    'SUCCESS',
    null
  );

  return query
  select
    curation_pool.id as pool_id,
    curation_pool.user_id,
    curation_pool.log_id,
    curation_pool.video_path,
    logs.video_url,
    logs.thumbnail_path,
    coalesce(profiles.nickname, '—') as display_name,
    profiles.gender,
    selected_redemption.id as redemption_id
  from public.curation_pool
  join public.logs on logs.id = curation_pool.log_id
  left join public.profiles on profiles.user_id = curation_pool.user_id
  where curation_pool.pool_date = effective_pool_date
    and curation_pool.user_id = any(selected_user_ids)
  order by array_position(selected_user_ids, curation_pool.user_id);
end;
$$;

revoke all on function public.consume_refresh_item(uuid[]) from public;
revoke all on function public.consume_refresh_item(uuid[]) from anon;
grant execute on function public.consume_refresh_item(uuid[]) to authenticated;
grant execute on function public.consume_refresh_item(uuid[]) to service_role;

create or replace function public.send_like(
  p_to_user_id      uuid,
  p_attached_log_id uuid DEFAULT NULL
)
returns public.likes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from             uuid := auth.uid();
  v_today            date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_today_count      int;
  v_user_a           uuid;
  v_user_b           uuid;
  v_has_any_video    boolean;
  v_heart_grant      public.refresh_item_grants;
  v_new_like         public.likes;
begin
  if v_from is null then
    raise exception 'not_authenticated';
  end if;
  if v_from = p_to_user_id then
    raise exception 'self_like_forbidden';
  end if;

  select exists (select 1 from public.logs where user_id = v_from limit 1)
  into v_has_any_video;
  if not v_has_any_video then
    raise exception 'no_video_history';
  end if;

  if p_attached_log_id is not null then
    if not exists (
      select 1 from public.logs where id = p_attached_log_id and user_id = v_from
    ) then
      raise exception 'attached_log_not_owned';
    end if;
  end if;

  v_user_a := least(v_from, p_to_user_id);
  v_user_b := greatest(v_from, p_to_user_id);
  if exists (select 1 from public.matches where user_a_id = v_user_a and user_b_id = v_user_b) then
    raise exception 'already_matched';
  end if;

  if exists (
    select 1 from public.likes
    where from_user_id = v_from
      and to_user_id = p_to_user_id
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'already_pending';
  end if;

  select count(*) into v_today_count
  from public.likes
  where from_user_id = v_from
    and (liked_at at time zone 'Asia/Seoul')::date = v_today;

  if v_today_count >= 1 then
    select *
      into v_heart_grant
      from public.refresh_item_grants
     where user_id = v_from
       and status = 'AVAILABLE'
       and remaining_count > 0
       and public.is_heart_product(product_id)
     order by granted_at asc
     for update skip locked
     limit 1;

    if v_heart_grant.id is null then
      raise exception 'heart_required';
    end if;
  end if;

  insert into public.likes (from_user_id, to_user_id, liked_at, status, expires_at, attached_log_id)
  values (v_from, p_to_user_id, now(), 'pending', now() + interval '7 days', p_attached_log_id)
  returning * into v_new_like;

  if v_heart_grant.id is not null then
    update public.refresh_item_grants
       set remaining_count = remaining_count - 1,
           status = case when remaining_count - 1 = 0 then 'CONSUMED' else 'AVAILABLE' end,
           consumed_at = case when remaining_count - 1 = 0 then now() else consumed_at end,
           updated_at = now()
     where id = v_heart_grant.id;
  end if;

  return v_new_like;
end;
$$;

revoke all on function public.get_available_heart_count(uuid) from public;
revoke all on function public.get_available_heart_count(uuid) from anon;
grant execute on function public.get_available_heart_count(uuid) to authenticated;
grant execute on function public.get_available_heart_count(uuid) to service_role;

revoke all on function public.is_refresh_item_product(text) from public;
revoke all on function public.is_heart_product(text) from public;
grant execute on function public.is_refresh_item_product(text) to authenticated;
grant execute on function public.is_refresh_item_product(text) to service_role;
grant execute on function public.is_heart_product(text) to authenticated;
grant execute on function public.is_heart_product(text) to service_role;

create or replace function public.complete_local_dev_consumable_purchase(
  p_product_id text default 'dei_refresh_1'
)
returns public.refresh_item_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_product_id text := trim(coalesce(p_product_id, ''));
  payment_row public.payments;
  grant_row public.refresh_item_grants;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if normalized_product_id = '' then
    raise exception 'product id is required';
  end if;

  if not public.is_refresh_item_product(normalized_product_id)
    and not public.is_heart_product(normalized_product_id)
  then
    raise exception 'unsupported local dev product id';
  end if;

  insert into public.payments (
    user_id,
    product_type,
    amount,
    currency,
    provider,
    product_id,
    payment_method,
    external_tx_id,
    purchased_at,
    raw_payload,
    "결제상태"
  )
  values (
    current_user_id,
    case
      when public.is_heart_product(normalized_product_id) then 'HEART'
      else 'REFRESH'
    end,
    0,
    'KRW',
    'local_dev',
    normalized_product_id,
    'LOCAL_DEV',
    'local-dev-' || gen_random_uuid()::text,
    now(),
    jsonb_build_object('source', 'complete_local_dev_consumable_purchase'),
    'SUCCESS'
  )
  returning * into payment_row;

  grant_row := public.grant_refresh_item(
    current_user_id,
    payment_row.id,
    normalized_product_id,
    1
  );

  return grant_row;
end;
$$;

revoke all on function public.complete_local_dev_consumable_purchase(text) from public;
revoke all on function public.complete_local_dev_consumable_purchase(text) from anon;
grant execute on function public.complete_local_dev_consumable_purchase(text) to authenticated;

-- Exclude active user blocks from paid refresh curation.
-- "차단_YN" only represents moderation/admin blocking on the pool row; user-level
-- blocks live in public.blocks and must hide candidates in both directions.

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

  select coalesce(array_agg(candidate.user_id order by candidate.pick_order), '{}'::uuid[])
  into selected_user_ids
  from (
    select
      distinct_candidate.user_id,
      row_number() over (order by random()) as pick_order
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
        and not exists (
          select 1
          from public.blocks
          where blocks.unblocked_at is null
            and (
              (
                blocks.blocker_user_id = current_user_id
                and blocks.blocked_user_id = curation_pool.user_id
              )
              or (
                blocks.blocker_user_id = curation_pool.user_id
                and blocks.blocked_user_id = current_user_id
              )
            )
        )
      group by curation_pool.user_id
    ) distinct_candidate
    order by pick_order
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

    return;
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
  order by array_position(selected_user_ids, curation_pool.user_id), curation_pool.created_at asc;
end;
$$;

revoke all on function public.consume_refresh_item(uuid[]) from public;
revoke all on function public.consume_refresh_item(uuid[]) from anon;
grant execute on function public.consume_refresh_item(uuid[]) to authenticated;
grant execute on function public.consume_refresh_item(uuid[]) to service_role;

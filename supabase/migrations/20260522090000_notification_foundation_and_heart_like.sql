-- Notification foundation + paid heart consumption for extra likes.
-- The existing refresh_item_grants ledger is the current server-owned heart balance.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_type_length check (char_length(trim(type)) between 1 and 80),
  constraint notifications_title_length check (char_length(trim(title)) between 1 and 120),
  constraint notifications_route_length check (route is null or char_length(route) <= 500),
  constraint notifications_dedupe_key_length check (dedupe_key is null or char_length(dedupe_key) <= 160)
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications(dedupe_key);

drop trigger if exists trg_notifications_updated on public.notifications;
create trigger trg_notifications_updated before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

drop policy if exists notifications_select_own_or_admin on public.notifications;
create policy notifications_select_own_or_admin
  on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all
  on public.notifications for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_notification_id uuid;
  normalized_dedupe_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if p_user_id is null then
    raise exception 'notification user is required';
  end if;

  if trim(coalesce(p_type, '')) = '' or trim(coalesce(p_title, '')) = '' then
    raise exception 'notification type and title are required';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'not allowed';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    route,
    metadata,
    dedupe_key
  )
  values (
    p_user_id,
    trim(p_type),
    trim(p_title),
    nullif(trim(coalesce(p_body, '')), ''),
    nullif(trim(coalesce(p_route, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    normalized_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into new_notification_id;

  if new_notification_id is null and normalized_dedupe_key is not null then
    select id
      into new_notification_id
      from public.notifications
     where dedupe_key = normalized_dedupe_key;
  end if;

  return new_notification_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, jsonb, text) from public;
revoke all on function public.create_notification(uuid, text, text, text, text, jsonb, text) from anon;
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb, text) to service_role;

create or replace function public.register_user_push_token(
  p_platform public.device_platform,
  p_installation_id_hash text,
  p_push_token text,
  p_push_provider public.push_provider default 'expo'::public.push_provider,
  p_app_version text default null,
  p_device_label text default null
)
returns public.user_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  device_row public.user_devices;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if trim(coalesce(p_installation_id_hash, '')) = '' then
    raise exception 'installation_id_hash_required';
  end if;

  if nullif(trim(coalesce(p_push_token, '')), '') is not null then
    update public.user_devices
       set revoked_at = coalesce(revoked_at, now()),
           updated_at = now()
     where push_token = trim(p_push_token)
       and revoked_at is null
       and not (
         user_id = current_user_id
         and installation_id_hash = trim(p_installation_id_hash)
       );
  end if;

  insert into public.user_devices (
    user_id,
    platform,
    installation_id_hash,
    push_provider,
    push_token,
    app_version,
    device_label,
    last_seen_at,
    revoked_at
  )
  values (
    current_user_id,
    p_platform,
    trim(p_installation_id_hash),
    p_push_provider,
    nullif(trim(coalesce(p_push_token, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    now(),
    null
  )
  on conflict (user_id, installation_id_hash)
  do update set
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    push_token = excluded.push_token,
    app_version = excluded.app_version,
    device_label = excluded.device_label,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning * into device_row;

  return device_row;
end;
$$;

revoke all on function public.register_user_push_token(
  public.device_platform,
  text,
  text,
  public.push_provider,
  text,
  text
) from public;
revoke all on function public.register_user_push_token(
  public.device_platform,
  text,
  text,
  public.push_provider,
  text,
  text
) from anon;
grant execute on function public.register_user_push_token(
  public.device_platform,
  text,
  text,
  public.push_provider,
  text,
  text
) to authenticated;

create or replace function public.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select coalesce(nullif(trim(nickname), ''), '새로운 사람')
    into sender_name
    from public.profiles
   where user_id = new.from_user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    route,
    metadata
  )
  values (
    new.to_user_id,
    'like_received',
    '새 좋아요가 도착했어요',
    sender_name || '님이 좋아요를 보냈어요.',
    '/likes?tab=received',
    jsonb_build_object('likeId', new.id, 'fromUserId', new.from_user_id)
  );

  return new;
end;
$$;

drop trigger if exists likes_notify_received on public.likes;
create trigger likes_notify_received
after insert on public.likes
for each row execute function public.notify_like_received();

-- Extra likes after the free daily quota consume one paid heart.
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

revoke all on function public.send_like(uuid, uuid) from public;
grant execute on function public.send_like(uuid, uuid) to authenticated;

create or replace function public.delete_own_log_and_recalculate(
  p_log_id uuid
)
returns table (
  log_date date,
  status text,
  remaining_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_log_date date;
  daily_row public.daily_logs;
  total_logs int;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select (logs.recorded_at at time zone 'Asia/Seoul')::date
    into deleted_log_date
    from public.logs
   where logs.id = p_log_id
     and logs.user_id = current_user_id;

  if deleted_log_date is null then
    raise exception 'log_not_found';
  end if;

  delete from public.logs
   where logs.id = p_log_id
     and logs.user_id = current_user_id;

  select *
    into daily_row
    from public.recalculate_daily_log_for_date(current_user_id, deleted_log_date);

  select count(*)::int
    into total_logs
    from public.logs
   where logs.user_id = current_user_id
     and (logs.recorded_at at time zone 'Asia/Seoul')::date = deleted_log_date;

  return query
  select
    deleted_log_date,
    daily_row.status::text,
    coalesce(total_logs, 0);
end;
$$;

revoke all on function public.delete_own_log_and_recalculate(uuid) from public;
revoke all on function public.delete_own_log_and_recalculate(uuid) from anon;
grant execute on function public.delete_own_log_and_recalculate(uuid) to authenticated;

notify pgrst, 'reload schema';

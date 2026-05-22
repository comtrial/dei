-- 영상 썸네일 인프라
-- 목적: <VideoView> 마운트 시 검은 화면 대신 포스터 이미지를 즉시 표시할 수 있도록
--       서버 측 썸네일 경로를 영상 레코드에 저장한다.
-- 호환: 기존 영상은 thumbnail_path 가 NULL 이며 클라이언트가 즉석에서 첫 프레임을 추출해 폴백한다.

-- 1) thumbnail_path 컬럼 추가 ----------------------------------------------------

alter table public.logs
  add column if not exists thumbnail_path text;

alter table public.profile_videos
  add column if not exists thumbnail_path text;

-- 2) thumbnails 스토리지 버킷 (public — 포스터는 일반 공개 정책) ------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'thumbnails',
  'thumbnails',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) thumbnails 버킷 RLS ---------------------------------------------------------
-- - SELECT: 누구나 (public 포스터)
-- - INSERT/UPDATE/DELETE: 본인 폴더(`{user_id}/...`) 또는 관리자

drop policy if exists "thumbnail_objects_select_all" on storage.objects;
create policy "thumbnail_objects_select_all"
  on storage.objects for select
  to public
  using (bucket_id = 'thumbnails');

drop policy if exists "thumbnail_objects_insert_own" on storage.objects;
create policy "thumbnail_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "thumbnail_objects_update_own_or_admin" on storage.objects;
create policy "thumbnail_objects_update_own_or_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "thumbnail_objects_delete_own_or_admin" on storage.objects;
create policy "thumbnail_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- 4) get_public_profile_logs RPC 시그니처 확장 -----------------------------------

drop function if exists public.get_public_profile_logs(uuid);
create or replace function public.get_public_profile_logs(p_profile_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  video_url text,
  thumbnail_path text,
  hour_slot smallint,
  duration_sec smallint,
  recorded_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    logs.id,
    logs.user_id,
    logs.video_url,
    logs.thumbnail_path,
    logs.hour_slot,
    logs.duration_sec,
    logs.recorded_at,
    logs.created_at
  from public.logs
  where logs.user_id = p_profile_user_id
    and logs."검수_YN" = 'Y'
    and logs."검수_상태" = 'APPROVED'
    and public.is_public_profile_visible(p_profile_user_id, auth.uid())
  order by logs.recorded_at desc;
$$;

revoke all on function public.get_public_profile_logs(uuid) from public;
grant execute on function public.get_public_profile_logs(uuid) to authenticated;

-- 5) consume_refresh_item RPC 시그니처 확장 --------------------------------------

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

notify pgrst, 'reload schema';

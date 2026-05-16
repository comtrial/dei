-- Public profile/feed RPCs for the mobile profile screens.
-- The app should not expose full profiles/logs rows for other users directly.

create or replace function public.is_public_profile_visible(
  p_profile_user_id uuid,
  p_viewer_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_user_id is not null
    and p_viewer_user_id is not null
    and p_profile_user_id <> p_viewer_user_id
    and exists (
      select 1
      from public.profiles
      where profiles.user_id = p_profile_user_id
        and profiles."회원상태" = 'ACTIVE'
        and profiles."차단_YN" = 'N'
    )
    and not exists (
      select 1
      from public.blocks
      where blocks.unblocked_at is null
        and (
          (
            blocks.blocker_user_id = p_viewer_user_id
            and blocks.blocked_user_id = p_profile_user_id
          )
          or (
            blocks.blocker_user_id = p_profile_user_id
            and blocks.blocked_user_id = p_viewer_user_id
          )
        )
    );
$$;

revoke all on function public.is_public_profile_visible(uuid, uuid) from public;

create or replace function public.get_public_profile(p_profile_user_id uuid)
returns table (
  profile_user_id uuid,
  nickname text,
  gender text,
  region_sido text,
  region_sigungu text,
  intro text,
  mbti text,
  interest_tags text[],
  interest_categories text[],
  photo_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profiles.user_id as profile_user_id,
    profiles.nickname,
    profiles.gender,
    profiles.region_sido,
    profiles.region_sigungu,
    profiles.intro,
    profiles.mbti,
    profiles.interest_tags,
    profiles.interest_categories,
    profiles.photo_url,
    profiles.created_at
  from public.profiles
  where profiles.user_id = p_profile_user_id
    and public.is_public_profile_visible(p_profile_user_id, auth.uid());
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated;

create or replace function public.get_public_profile_logs(p_profile_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  video_url text,
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

create or replace function public.create_profile_report(
  p_reported_id uuid,
  p_reason text default '프로필 신고',
  p_reason_category text default 'OTHER',
  p_description text default null,
  p_log_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_report_id uuid;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_reported_id is null or p_reported_id = current_user_id then
    raise exception 'invalid reported user';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.user_id = p_reported_id
      and profiles."회원상태" = 'ACTIVE'
  ) then
    raise exception 'reported profile was not found';
  end if;

  if p_log_id is not null and not exists (
    select 1
    from public.logs
    where logs.id = p_log_id
      and logs.user_id = p_reported_id
  ) then
    raise exception 'reported log was not found';
  end if;

  insert into public.reports (
    reporter_id,
    reported_id,
    log_id,
    reason,
    reason_category,
    description,
    "처리상태"
  )
  values (
    current_user_id,
    p_reported_id,
    p_log_id,
    coalesce(nullif(trim(p_reason), ''), '프로필 신고'),
    coalesce(nullif(trim(p_reason_category), ''), 'OTHER'),
    nullif(trim(coalesce(p_description, '')), ''),
    'PENDING'
  )
  returning id into new_report_id;

  return new_report_id;
end;
$$;

revoke all on function public.create_profile_report(uuid, text, text, text, uuid) from public;
grant execute on function public.create_profile_report(uuid, text, text, text, uuid) to authenticated;

create or replace function public.block_profile_user(
  p_blocked_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_block_id uuid;
  new_block_id uuid;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_blocked_user_id is null or p_blocked_user_id = current_user_id then
    raise exception 'invalid blocked user';
  end if;

  select blocks.id
    into existing_block_id
    from public.blocks
   where blocks.blocker_user_id = current_user_id
     and blocks.blocked_user_id = p_blocked_user_id
     and blocks.unblocked_at is null
   limit 1;

  if existing_block_id is not null then
    return existing_block_id;
  end if;

  insert into public.blocks (
    blocker_user_id,
    blocked_user_id,
    reason
  )
  values (
    current_user_id,
    p_blocked_user_id,
    nullif(trim(coalesce(p_reason, '')), '')
  )
  returning id into new_block_id;

  return new_block_id;
end;
$$;

revoke all on function public.block_profile_user(uuid, text) from public;
grant execute on function public.block_profile_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';

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

  -- The target user is the newly authenticated session created during onboarding.
  -- Remove only shell rows that would conflict with the existing account identity.
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

drop trigger if exists profile_videos_notify_review_pending on public.profile_videos;
create trigger profile_videos_notify_review_pending
  after insert on public.profile_videos
  for each row
  when (new.moderation_status = 'pending')
  execute function public.notify_video_review_pending('profile_videos');

drop policy if exists "profile_image_objects_select_own_or_admin" on storage.objects;
create policy "profile_image_objects_select_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.photo_url = storage.objects.name
      )
      or public.is_admin()
    )
  );

drop policy if exists "profile_image_objects_update_own_or_admin" on storage.objects;
create policy "profile_image_objects_update_own_or_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.photo_url = storage.objects.name
      )
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.photo_url = storage.objects.name
      )
      or public.is_admin()
    )
  );

drop policy if exists "profile_image_objects_delete_own_or_admin" on storage.objects;
create policy "profile_image_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.photo_url = storage.objects.name
      )
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_select_own_or_admin" on storage.objects;
create policy "profile_video_objects_select_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profile_videos
        where profile_videos.user_id = auth.uid()
          and profile_videos.storage_bucket = storage.objects.bucket_id
          and profile_videos.storage_path = storage.objects.name
      )
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_update_own_or_admin" on storage.objects;
create policy "profile_video_objects_update_own_or_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profile_videos
        where profile_videos.user_id = auth.uid()
          and profile_videos.storage_bucket = storage.objects.bucket_id
          and profile_videos.storage_path = storage.objects.name
      )
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profile_videos
        where profile_videos.user_id = auth.uid()
          and profile_videos.storage_bucket = storage.objects.bucket_id
          and profile_videos.storage_path = storage.objects.name
      )
      or public.is_admin()
    )
  );

drop policy if exists "profile_video_objects_delete_own_or_admin" on storage.objects;
create policy "profile_video_objects_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.profile_videos
        where profile_videos.user_id = auth.uid()
          and profile_videos.storage_bucket = storage.objects.bucket_id
          and profile_videos.storage_path = storage.objects.name
      )
      or public.is_admin()
    )
  );

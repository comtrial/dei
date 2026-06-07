-- Allow active room members to view each other's private profile photos.
-- Clients store profile.photo_url as a bucket object path and call createSignedUrl;
-- that call needs storage.objects select permission for the target object.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_select_active_room_member'
  ) then
    create policy profile_photos_select_active_room_member on storage.objects
      for select to authenticated
      using (
        bucket_id = 'profile-photos'
        and case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then exists (
            select 1
            from public.room_member viewer
            join public.room_member target
              on target.room_id = viewer.room_id
            where viewer.user_id = auth.uid()
              and viewer.status = 'active'
              and target.status = 'active'
              and target.user_id = ((storage.foldername(name))[1])::uuid
              and not public.is_blocked_between(auth.uid(), target.user_id)
          )
          else false
        end
      );
  end if;
end $$;

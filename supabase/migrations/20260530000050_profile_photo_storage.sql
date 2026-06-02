-- B onboarding: profile photo upload storage bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_select_self'
  ) then
    create policy profile_photos_select_self on storage.objects
      for select to authenticated
      using (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_insert_self'
  ) then
    create policy profile_photos_insert_self on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_update_self'
  ) then
    create policy profile_photos_update_self on storage.objects
      for update to authenticated
      using (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

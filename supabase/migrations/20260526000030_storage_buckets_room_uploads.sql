-- Storage 버킷 — 방 단위 3초 영상 + 썸네일.
--
-- 정책:
--   - 같은 방 active member 만 read
--   - 블러 게이트: 본인이 24h 내 hourly_uploads 1건 있을 때만 다른 멤버 영상 read
--   - 차단 양방향 숨김
--   - 본인만 INSERT (storage_path 패턴: 'rooms/<roomId>/<profileId>/<uuid>.mp4')
--   - DELETE 는 service_role (`expire-rooms`, `purge-expired-uploads` cron) 만

insert into storage.buckets (id, name, public)
values
  ('room-uploads', 'room-uploads', false),
  ('room-thumbnails', 'room-thumbnails', false)
on conflict (id) do nothing;

-- ============================================================================
-- room-uploads (3초 영상)
-- ============================================================================

create policy "room-uploads: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-uploads'
    and (storage.foldername(name))[1] = 'rooms'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

create policy "room-uploads: select with blur gate"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'room-uploads'
    and (
      -- 본인 업로드는 항상
      (storage.foldername(name))[3] = auth.uid()::text
      -- 같은 방 active member + 본인 24h 내 업로드 있음 + 차단 양방향 아님
      or exists (
        select 1
          from public.hourly_uploads hu
         where hu.storage_path = storage.objects.name
           and exists (
             select 1 from public.room_members rm
              where rm.room_id = hu.room_id
                and rm.profile_id = auth.uid()
                and rm.status = 'active'
           )
           and exists (
             select 1 from public.hourly_uploads me
              where me.profile_id = auth.uid()
                and me.room_id = hu.room_id
                and me.uploaded_at > now() - interval '24 hours'
           )
           and not exists (
             select 1 from public.v_block_pairs vp
              where vp.a = auth.uid() and vp.b = hu.profile_id
           )
      )
    )
  );

-- ============================================================================
-- room-thumbnails (썸네일) — blur gate 무관, 같은 방 active member 면 OK
-- ============================================================================

create policy "room-thumbnails: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-thumbnails'
    and (storage.foldername(name))[1] = 'rooms'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

create policy "room-thumbnails: select same room"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'room-thumbnails'
    and (
      (storage.foldername(name))[3] = auth.uid()::text
      or exists (
        select 1 from public.hourly_uploads hu
         where hu.thumbnail_path = storage.objects.name
           and exists (
             select 1 from public.room_members rm
              where rm.room_id = hu.room_id
                and rm.profile_id = auth.uid()
                and rm.status = 'active'
           )
           and not exists (
             select 1 from public.v_block_pairs vp
              where vp.a = auth.uid() and vp.b = hu.profile_id
           )
      )
    )
  );

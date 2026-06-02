-- C-0 · room-videos Storage 버킷 + RLS
-- 임시 가정 채택 (A 리뷰 시 정식화):
--   버킷 path: room-videos/{room_id}/{user_id}/{video_id}.mp4 (썸네일 .jpg 동일 버킷)
--   public = false (signed URL 발급 필요)

-- ── 버킷 생성 ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-videos',
  'room-videos',
  false,
  3145728,  -- 3MB (POLICY.video.maxFileSizeBytes)
  array['video/mp4', 'image/jpeg']
)
on conflict (id) do nothing;

-- ── RLS 활성화 ───────────────────────────────────────────────────────────────
-- storage.objects 에 RLS 는 Supabase 기본 활성화 상태이므로 별도 enable 불필요.

-- ── SELECT: 같은 room_member 만 읽기 ─────────────────────────────────────────
-- path 구조: {room_id}/{user_id}/{video_id}.{ext}
-- path 1번째 segment = room_id
create policy "room_videos_select_room_member"
  on storage.objects for select
  using (
    bucket_id = 'room-videos'
    and exists (
      select 1 from public.room_member rm
      where rm.room_id = (string_to_array(name, '/'))[1]::uuid
        and rm.user_id = auth.uid()
        and rm.status = 'active'
    )
  );

-- ── INSERT: path 2번째 segment = auth.uid() (본인만 업로드) ──────────────────
create policy "room_videos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'room-videos'
    and (string_to_array(name, '/'))[2]::uuid = auth.uid()
  );

-- ── UPDATE: 금지 (영상은 불변) ───────────────────────────────────────────────
-- 별도 policy 없음 = UPDATE 차단

-- ── DELETE: 본인만 (cleanup 용) ──────────────────────────────────────────────
create policy "room_videos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'room-videos'
    and (string_to_array(name, '/'))[2]::uuid = auth.uid()
  );

-- profile-images: 대화/매칭 상대의 프로필 사진도 볼 수 있게 SELECT 정책 확장.
--
-- 버그: 채팅방/목록에서 상대 프로필 사진의 signed URL 생성이 storage RLS 로
-- 막혀 'StorageApiError: Object not found' 가 났다 (feature=chat-list, 실기기 재현).
-- 기존 profile_image_objects_select_own_or_admin 은 본인 폴더 / 본인 프로필
-- 사진 / 관리자만 허용해서, 매칭 상대의 사진(다른 user 폴더)을 볼 수 없었다.
--
-- 수정: 같은 ACTIVE conversation 에 속한 상대의 사진도 허용 (양방향 차단 없을 때).
-- profiles.photo_url 이 곧 object name 이고, 그 photo 의 주인이 나와 ACTIVE 대화
-- 상대면 SELECT 허용. (채팅에서 상대 닉네임/프로필을 이미 볼 수 있으므로 사진도
-- 같은 가시성 범위.)

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
      -- 매칭(대화) 상대의 프로필 사진: 같은 ACTIVE conversation + 미차단.
      or exists (
        select 1
        from public.profiles p
        join public.conversations c
          on (
            (c.user_a_id = auth.uid() and c.user_b_id = p.user_id)
            or (c.user_b_id = auth.uid() and c.user_a_id = p.user_id)
          )
        where p.photo_url = storage.objects.name
          and c.status = 'ACTIVE'
          and not public.chat_is_blocked_between(c.user_a_id, c.user_b_id)
      )
      or public.is_admin()
    )
  );

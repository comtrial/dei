-- 검수용 썸네일 컬럼 추가 (HEVC 영상 Chrome 재생 불가 우회)
-- 모바일 업로드 시 영상에서 프레임 3장 추출 → storage path 배열로 저장
-- profiles.interest_categories 와 동일 컨벤션: text[] NOT NULL DEFAULT '{}'
ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS thumbnail_urls text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.logs.thumbnail_urls IS
  '검수용 썸네일 storage path 배열 (logs 버킷, {user_id}/{ts}_thumb_N.jpg). HEVC 영상 Chrome 재생 불가 우회. 모바일 업로드 시 3장 생성, 빈 배열 = 썸네일 없음(과거 영상).';;

-- logs.comment 컬럼 추가 — 영상 검수 화면(result.tsx)에서 사용자가 입력하는
-- 짧은 코멘트(캡션)를 영상과 함께 저장한다. 본인/타인 상세에서 영상 위
-- 오버레이로 노출 (작성한 사용자의 의도된 메시지이므로 RLS 는 video_url
-- 가시성과 동일하게 따라간다 — 별도 정책 불필요).
--
-- 정책:
--   - 길이 상한 50자. (UX 상 영상 위 오버레이 한 줄에 맞춤. Edge Function
--     쪽에서도 동일 길이로 1차 검증하며, 본 CHECK 가 마지막 방어선.)
--   - NULL 허용. 기존 row 와 코멘트 미입력 케이스를 모두 NULL 로 표현.
--   - 빈 문자열은 클라/Edge 양쪽에서 NULL 로 정규화하지만, 혹시 새어
--     들어와도 길이 제약은 통과한다 (length('') = 0).
ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS comment text NULL;

-- 50자 상한. ADD CONSTRAINT 는 IF NOT EXISTS 미지원이므로 DO 블록으로 멱등 처리.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logs_comment_length_check'
      AND conrelid = 'public.logs'::regclass
  ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_comment_length_check
      CHECK (comment IS NULL OR char_length(comment) <= 50);
  END IF;
END $$;

COMMENT ON COLUMN public.logs.comment IS
  '영상 검수 화면에서 사용자가 입력한 짧은 코멘트(캡션). 최대 50자. NULL = 미입력. 본인/타인 상세 화면 모두에서 영상 위 오버레이로 노출.';

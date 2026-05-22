
-- 1. 중복 log_id 행 제거 (최신 1개만 유지)
DELETE FROM curation_pool
WHERE id IN (
  '7c3e618b-31f9-49d0-a589-d919842b93c2',
  '6d906aed-623d-41e0-afba-a37bc060b472',
  'f0e3e177-e9d3-40dd-8b18-ce3a5652eaf8'
);

-- 2. 유저당 하루 1개 제약 제거
ALTER TABLE curation_pool DROP CONSTRAINT curation_pool_user_id_pool_date_key;

-- 3. log_id unique 추가 (같은 영상 중복 방지)
ALTER TABLE curation_pool ADD CONSTRAINT curation_pool_log_id_key UNIQUE (log_id);

-- 4. 트리거 함수 수정 — ON CONFLICT (log_id) DO NOTHING
CREATE OR REPLACE FUNCTION insert_approved_log_to_curation_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."검수_상태" = 'APPROVED' AND (OLD."검수_상태" IS DISTINCT FROM 'APPROVED') THEN
    INSERT INTO curation_pool (
      user_id,
      log_id,
      pool_date,
      "검수_YN",
      "차단_YN",
      video_path
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      CURRENT_DATE,
      'Y',
      'N',
      NEW.video_url
    )
    ON CONFLICT (log_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
;

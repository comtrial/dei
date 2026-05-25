
-- 검수 승인 시 curation_pool 자동 삽입 함수
CREATE OR REPLACE FUNCTION insert_approved_log_to_curation_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 검수_상태가 APPROVED로 변경될 때만 실행
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
    -- 같은 날 이미 같은 유저의 항목이 있으면 무시 (unique: user_id + pool_date)
    ON CONFLICT (user_id, pool_date) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 기존 트리거가 있으면 삭제 후 재생성
DROP TRIGGER IF EXISTS logs_sync_curation_pool ON logs;

CREATE TRIGGER logs_sync_curation_pool
  AFTER UPDATE ON logs
  FOR EACH ROW
  EXECUTE FUNCTION insert_approved_log_to_curation_pool();
;

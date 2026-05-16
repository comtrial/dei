-- 날짜 지정 데일리 로그 재계산 RPC
-- 기존 recalculate_daily_log(p_user_id) 는 오늘 날짜만 처리 — 임의 날짜 삭제 지원

CREATE OR REPLACE FUNCTION public.recalculate_daily_log_for_date(
  p_user_id uuid,
  p_log_date date
)
RETURNS public.daily_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_hours int;
  v_total_logs     int;
  v_row            public.daily_logs;
BEGIN
  SELECT
    COUNT(DISTINCT hour_slot),
    COUNT(*)
  INTO v_distinct_hours, v_total_logs
  FROM public.logs
  WHERE user_id = p_user_id
    AND recorded_at >= (p_log_date::timestamptz)
    AND recorded_at <  ((p_log_date + 1)::timestamptz);

  -- 그날 로그 0개: daily_logs row 삭제
  IF v_total_logs = 0 THEN
    DELETE FROM public.daily_logs
    WHERE user_id = p_user_id AND log_date = p_log_date;
    RETURN NULL;
  END IF;

  INSERT INTO public.daily_logs (user_id, log_date, status, updated_at)
  VALUES (
    p_user_id,
    p_log_date,
    CASE WHEN v_distinct_hours >= 3 THEN 'COMPLETED' ELSE 'INCOMPLETE' END,
    now()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE
  SET status     = EXCLUDED.status,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_daily_log_for_date(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.recalculate_daily_log_for_date(uuid, date) TO authenticated;

-- logs DELETE 정책 (본인 로그만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'logs' AND policyname = 'users can delete own logs'
  ) THEN
    EXECUTE '
      CREATE POLICY "users can delete own logs"
        ON public.logs FOR DELETE
        USING (user_id = auth.uid())
    ';
  END IF;
END $$;

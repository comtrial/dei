-- send_like: 좋아요 발송 (원자적 검증 + INSERT)
-- 영상이력 / 매칭중복 / pending중복 / 일일한도 / 소유권 검증 포함

CREATE OR REPLACE FUNCTION public.send_like(
  p_to_user_id      uuid,
  p_attached_log_id uuid DEFAULT NULL
)
RETURNS public.likes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from             uuid := auth.uid();
  v_today            date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_today_count      int;
  v_user_a           uuid;
  v_user_b           uuid;
  v_has_any_video    boolean;
  v_new_like         public.likes;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_from = p_to_user_id THEN
    RAISE EXCEPTION 'self_like_forbidden';
  END IF;

  -- 1) 영상 이력 검증
  SELECT EXISTS (SELECT 1 FROM public.logs WHERE user_id = v_from LIMIT 1)
  INTO v_has_any_video;
  IF NOT v_has_any_video THEN
    RAISE EXCEPTION 'no_video_history';
  END IF;

  -- 2) 첨부 로그 소유권
  IF p_attached_log_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.logs WHERE id = p_attached_log_id AND user_id = v_from
    ) THEN
      RAISE EXCEPTION 'attached_log_not_owned';
    END IF;
  END IF;

  -- 3) 매칭 중복 차단
  v_user_a := LEAST(v_from, p_to_user_id);
  v_user_b := GREATEST(v_from, p_to_user_id);
  IF EXISTS (SELECT 1 FROM public.matches WHERE user_a_id = v_user_a AND user_b_id = v_user_b) THEN
    RAISE EXCEPTION 'already_matched';
  END IF;

  -- 4) 중복 pending 차단
  IF EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user_id = v_from
      AND to_user_id   = p_to_user_id
      AND status       = 'pending'
      AND expires_at   > now()
  ) THEN
    RAISE EXCEPTION 'already_pending';
  END IF;

  -- 5) 일일 한도 (KST 기준, FREE = 1회)
  SELECT COUNT(*) INTO v_today_count
  FROM public.likes
  WHERE from_user_id = v_from
    AND (liked_at AT TIME ZONE 'Asia/Seoul')::date = v_today;
  IF v_today_count >= 1 THEN
    RAISE EXCEPTION 'daily_quota_exceeded';
  END IF;

  -- 6) INSERT
  INSERT INTO public.likes (from_user_id, to_user_id, liked_at, status, expires_at, attached_log_id)
  VALUES (v_from, p_to_user_id, now(), 'pending', now() + interval '7 days', p_attached_log_id)
  RETURNING * INTO v_new_like;

  RETURN v_new_like;
END;
$$;

REVOKE ALL ON FUNCTION public.send_like(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.send_like(uuid, uuid) TO authenticated;

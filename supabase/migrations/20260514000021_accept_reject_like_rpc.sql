-- accept_like: 수락 + 매칭 생성 (원자적)
CREATE OR REPLACE FUNCTION public.accept_like(p_like_id uuid)
RETURNS TABLE (match_id uuid, counterpart_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_like       public.likes;
  v_user_a     uuid;
  v_user_b     uuid;
  v_match_id   uuid;
  v_counterpart uuid;
BEGIN
  SELECT * INTO v_like FROM public.likes WHERE id = p_like_id FOR UPDATE;

  IF v_like.id IS NULL THEN
    RAISE EXCEPTION 'like_not_found';
  END IF;
  IF v_like.to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_like.status <> 'pending' THEN
    RAISE EXCEPTION 'like_not_pending:%', v_like.status;
  END IF;
  IF v_like.expires_at <= now() THEN
    RAISE EXCEPTION 'like_expired';
  END IF;

  -- 양방향 pending likes accepted 처리
  UPDATE public.likes
  SET status = 'accepted', responded_at = now()
  WHERE status = 'pending'
    AND (
      (from_user_id = v_like.from_user_id AND to_user_id = v_like.to_user_id)
      OR (from_user_id = v_like.to_user_id AND to_user_id = v_like.from_user_id)
    );

  -- 순서 정규화 후 matches UPSERT
  v_user_a := LEAST(v_like.from_user_id, v_like.to_user_id);
  v_user_b := GREATEST(v_like.from_user_id, v_like.to_user_id);

  INSERT INTO public.matches (user_a_id, user_b_id, source_like_id)
  VALUES (v_user_a, v_user_b, p_like_id)
  ON CONFLICT (user_a_id, user_b_id) DO UPDATE
    SET source_like_id = EXCLUDED.source_like_id
  RETURNING id INTO v_match_id;

  v_counterpart := CASE WHEN v_user_a = auth.uid() THEN v_user_b ELSE v_user_a END;

  RETURN QUERY SELECT v_match_id, v_counterpart;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_like(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_like(uuid) TO authenticated;

-- reject_like
CREATE OR REPLACE FUNCTION public.reject_like(p_like_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.likes
  SET status = 'rejected', responded_at = now()
  WHERE id = p_like_id
    AND to_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'like_not_rejectable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_like(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_like(uuid) TO authenticated;

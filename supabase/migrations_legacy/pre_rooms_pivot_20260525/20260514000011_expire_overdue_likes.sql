-- 만료된 likes를 expired로 lazy 처리하는 RPC
-- 받은/보낸 좋아요 화면 진입 시 호출

CREATE OR REPLACE FUNCTION public.expire_overdue_likes(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.likes
    SET status = 'expired'
    WHERE (from_user_id = p_user_id OR to_user_id = p_user_id)
      AND status = 'pending'
      AND expires_at <= now()
    RETURNING id
  )
  SELECT COUNT(*)::int FROM updated;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_likes(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_overdue_likes(uuid) TO authenticated;

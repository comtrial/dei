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
GRANT EXECUTE ON FUNCTION public.expire_overdue_likes(uuid) TO authenticated;;

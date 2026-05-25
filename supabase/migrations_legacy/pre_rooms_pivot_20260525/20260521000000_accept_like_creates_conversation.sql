-- accept_like 가 매칭 수락 시 conversation 도 함께 생성하도록 수정.
--
-- 버그: 기존 accept_like 는 matches 만 INSERT 하고 conversations 를 만들지 않았다.
-- 앱의 매칭/채팅 목록(fetchChatList)은 conversations 테이블을 조회하므로,
-- 좋아요를 수락해 매칭이 성립해도 conversation row 가 없어 양쪽 매칭 화면에
-- 아무것도 뜨지 않고 채팅도 시작할 수 없었다 (ACTIVE matches 전부 conversation 0건).
--
-- 수정: matches UPSERT 직후 conversations 도 멱등하게 INSERT
-- (ensure_conversation_for_match 와 동일한 로직을 인라인). accept_like 는
-- SECURITY DEFINER 라 conversations RLS 를 우회해 INSERT 할 수 있다.

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

  -- 매칭에 대응하는 conversation 을 멱등하게 생성 (앱 매칭/채팅 목록의 source).
  -- 이미 존재하면 DELETED 가 아닌 한 ACTIVE 유지.
  -- ON CONFLICT 는 제약명으로 지정 (컬럼명 match_id 가 RETURNS TABLE 의 OUT
  -- 파라미터와 겹쳐 모호해지는 것을 피함).
  INSERT INTO public.conversations (match_id, user_a_id, user_b_id, status)
  VALUES (v_match_id, v_user_a, v_user_b, 'ACTIVE')
  ON CONFLICT ON CONSTRAINT conversations_match_id_key DO UPDATE
    SET status = CASE
          WHEN public.conversations.status = 'DELETED' THEN 'DELETED'
          ELSE 'ACTIVE'
        END;

  v_counterpart := CASE WHEN v_user_a = auth.uid() THEN v_user_b ELSE v_user_a END;

  RETURN QUERY SELECT v_match_id, v_counterpart;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_like(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_like(uuid) TO authenticated;

-- 백필: conversation 이 없는 기존 ACTIVE 매칭에 대해 conversation 생성.
-- (이 버그로 누락된 과거 매칭 복구. 멱등.)
INSERT INTO public.conversations (match_id, user_a_id, user_b_id, status)
SELECT m.id, m.user_a_id, m.user_b_id, 'ACTIVE'
FROM public.matches m
LEFT JOIN public.conversations c ON c.match_id = m.id
WHERE m.status = 'ACTIVE'
  AND c.id IS NULL
ON CONFLICT (match_id) DO NOTHING;

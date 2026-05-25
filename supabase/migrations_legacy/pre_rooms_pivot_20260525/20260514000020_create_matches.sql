-- matches 테이블 신규
-- (user_a_id < user_b_id) 순서 정규화로 UNIQUE 중복 매칭 방지

CREATE TABLE IF NOT EXISTS public.matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_like_id uuid REFERENCES public.likes(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT matches_order_chk CHECK (user_a_id < user_b_id),
  CONSTRAINT matches_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS matches_user_a_idx ON public.matches (user_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_user_b_idx ON public.matches (user_b_id, created_at DESC);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own matches"
  ON public.matches FOR SELECT
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

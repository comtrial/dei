ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS status text NOT NULL
    DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL
    DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS attached_log_id uuid REFERENCES public.logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE INDEX IF NOT EXISTS likes_to_user_status_idx
  ON public.likes (to_user_id, status, liked_at DESC);
CREATE INDEX IF NOT EXISTS likes_from_user_status_idx
  ON public.likes (from_user_id, status, liked_at DESC);

DROP POLICY IF EXISTS "users can read own likes" ON public.likes;
DROP POLICY IF EXISTS "users can read sent or received likes" ON public.likes;
CREATE POLICY "users can read sent or received likes"
  ON public.likes FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'likes' AND policyname = 'receivers can update own incoming likes'
  ) THEN
    EXECUTE '
      CREATE POLICY "receivers can update own incoming likes"
        ON public.likes FOR UPDATE
        USING (to_user_id = auth.uid())
        WITH CHECK (to_user_id = auth.uid())
    ';
  END IF;
END $$;;

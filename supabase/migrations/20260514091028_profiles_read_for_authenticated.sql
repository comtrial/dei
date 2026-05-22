-- 좋아요/매칭 등 상대방 프로필 표시에 필요
-- 인증된 유저는 모든 활성 프로필 읽기 허용
CREATE POLICY "authenticated users can read active profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);;

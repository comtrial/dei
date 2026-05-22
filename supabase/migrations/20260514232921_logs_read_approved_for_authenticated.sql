
CREATE POLICY "authenticated users can read approved logs"
  ON public.logs
  FOR SELECT
  TO authenticated
  USING (검수_상태 = 'APPROVED');
;

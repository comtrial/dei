create policy video_insert_own on public.video
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.room_is_member(room_id, auth.uid())
  );

create policy video_update_own on public.video
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.room_is_member(room_id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    and public.room_is_member(room_id, auth.uid())
  );

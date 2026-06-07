-- Safety: allow a user to refresh their own existing block row.
-- The mobile client uses upsert on (blocker_user_id, blocked_user_id); when a
-- conflict occurs PostgREST takes the UPDATE path, so RLS must allow that path.

create policy block_update_self on public.block
  for update to authenticated
  using (blocker_user_id = auth.uid())
  with check (blocker_user_id = auth.uid());

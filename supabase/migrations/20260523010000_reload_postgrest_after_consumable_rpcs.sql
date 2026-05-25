-- Refresh PostgREST schema cache after consumable RPC additions.
--
-- The heart/refresh consumable RPCs were introduced in an already-applied
-- migration. A separate migration makes the reload run on existing remote DBs
-- as well as on fresh local resets.

notify pgrst, 'reload schema';

-- Region must be a soft preference only. Exact-size or relaxed matches should
-- not be blocked just because both queues have different non-null regions.
create or replace function public.try_match(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me record; cand record; v_tier int; v_waited int;
  v_my_ids uuid[]; v_other_ids uuid[]; v_gm uuid;
  v_side_max int := public.match_cfg_int('side_max',5);
  v_cap int := public.match_cfg_int('cell_cap',8);
  v_uid uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtext('match'));

  select q.*, t.target_size as t_size into me
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.id=p_queue_id and q.status='waiting' for update;
  if me is null then return null; end if;

  if v_uid is not null
     and not exists (select 1 from public.team_member tm
                     where tm.team_id = me.team_id and tm.user_id = v_uid) then
    raise exception 'not_owner';
  end if;

  v_waited := floor(extract(epoch from (now()-me.enqueued_at))/60);
  v_tier := public._tier_of(v_waited);

  select q.*, t.target_size as t_size, t.kind as t_kind into cand
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.status='waiting'
      and q.gender = me.required_gender
      and q.team_id <> me.team_id
      and (q.expires_at is null or q.expires_at > now())
      and (
        (v_tier = 0 and q.desired_size = me.desired_size)
        or (v_tier >= 1 and (q.desired_size + me.desired_size) <= v_cap
            and q.desired_size <= v_side_max and me.desired_size <= v_side_max)
      )
    order by (me.region is not distinct from q.region) desc, public._match_boost(q.enqueued_at) asc
    limit 1 for update skip locked;

  if cand is null then
    if v_tier >= 1 and me.desired_size = 1 then
      return public._try_solo_merge(me.id, me.gender, me.required_gender, v_waited);
    end if;
    return null;
  end if;

  select array_agg(tm.user_id) into v_my_ids from public.team_member tm where tm.team_id=me.team_id;
  select array_agg(tm.user_id) into v_other_ids from public.team_member tm where tm.team_id=cand.team_id;

  v_gm := public.match_and_create(v_my_ids, me.gender, v_other_ids, cand.gender);
  if v_gm is null then return null; end if;
  update public.match_queue set status='matched', matched_at=now()
    where id in (me.id, cand.id) and status='waiting';
  return v_gm;
end $$;

revoke all on function public.try_match(uuid) from public, anon;
grant execute on function public.try_match(uuid) to authenticated;

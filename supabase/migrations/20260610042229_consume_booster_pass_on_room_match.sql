-- Consume paid instant-rematch passes only when a room is actually created.
-- Enqueue may stay waiting or be cancelled, so charging at queue time is too early.
create or replace function public.match_and_create(
  p_side_a_user_ids uuid[], p_side_a_gender text,
  p_side_b_user_ids uuid[], p_side_b_gender text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_a uuid; v_team_b uuid; v_tmp uuid; v_room uuid; v_gm uuid; v_cnt int;
  v_all uuid[] := p_side_a_user_ids || p_side_b_user_ids;
  v_restricted_user uuid;
begin
  if array_length(p_side_a_user_ids,1) is null or array_length(p_side_b_user_ids,1) is null then
    raise exception 'empty_side';
  end if;
  if p_side_a_gender = p_side_b_gender then raise exception 'same_gender'; end if;

  if (select count(*) from unnest(v_all)) <> (select count(distinct u) from unnest(v_all) u) then
    raise exception 'duplicate_seat';
  end if;

  if array_length(p_side_a_user_ids,1) > public.match_cfg_int('side_max',5)
     or array_length(p_side_b_user_ids,1) > public.match_cfg_int('side_max',5)
     or (array_length(p_side_a_user_ids,1)+array_length(p_side_b_user_ids,1)) > public.match_cfg_int('cell_cap',8) then
    raise exception 'over_capacity';
  end if;

  if exists (
    select 1 from public.profile p
    where (p.user_id = any(p_side_a_user_ids) and p.gender is distinct from p_side_a_gender)
       or (p.user_id = any(p_side_b_user_ids) and p.gender is distinct from p_side_b_gender)
  ) then
    raise exception 'gender_mismatch';
  end if;

  if (select count(*) from public.profile p where p.user_id = any(v_all)) <> array_length(v_all,1) then
    raise exception 'profile_missing';
  end if;

  if exists (select 1 from public.profile p
             where p.user_id = any(v_all) and p.is_in_active_room) then
    raise exception 'member_busy';
  end if;

  for v_restricted_user in
    select p.user_id
    from public.profile p
    where p.user_id = any(v_all)
      and p.gender = 'male'
      and p.last_room_leave_at is not null
      and p.last_room_leave_at > now() - interval '12 hours'
  loop
    update public.pass p
    set
      remaining = p.remaining - 1,
      status = case when p.remaining - 1 > 0 then 'active' else 'consumed' end
    where p.id = (
      select p2.id
      from public.pass p2
      where p2.user_id = v_restricted_user
        and p2.kind = 'booster'
        and p2.status = 'active'
        and p2.remaining > 0
      order by p2.created_at asc
      limit 1
      for update
    );

    if not found then
      raise exception 'rematch_pass_required';
    end if;
  end loop;

  v_team_a := public._ensure_side_team(p_side_a_user_ids, p_side_a_gender);
  v_team_b := public._ensure_side_team(p_side_b_user_ids, p_side_b_gender);

  if v_team_a > v_team_b then v_tmp := v_team_a; v_team_a := v_team_b; v_team_b := v_tmp; end if;

  insert into public.room(status, member_count, active_member_count, expires_at)
    values('active', 0, 0, now() + interval '7 days') returning id into v_room;
  insert into public.group_match(team_a_id, team_b_id, room_id, status)
    values(v_team_a, v_team_b, v_room, 'active') returning id into v_gm;
  insert into public.match_member(match_id, user_id, side)
    select v_gm, tm.user_id, case when tm.team_id = v_team_a then 'a' else 'b' end
    from public.team_member tm where tm.team_id in (v_team_a, v_team_b);
  insert into public.room_member(room_id, user_id, role, status)
    select v_room, tm.user_id, 'member', 'active'
    from public.team_member tm where tm.team_id in (v_team_a, v_team_b);
  select count(*) into v_cnt from public.room_member where room_id = v_room and status='active';
  update public.room set member_count = v_cnt, active_member_count = v_cnt where id = v_room;
  update public.profile set is_in_active_room = true where user_id = any(v_all);
  update public.team set status='locked' where id in (v_team_a, v_team_b);
  update public.match_queue set status='matched', matched_at=now()
    where team_id in (v_team_a, v_team_b) and status='waiting';
  insert into public.room_lifecycle(room_id, event, detail)
    values(v_room, 'created', jsonb_build_object('match_id', v_gm));
  return v_gm;
exception
  when unique_violation then return null;
end $$;

revoke all on function public.match_and_create(uuid[],text,uuid[],text) from public, anon, authenticated;
grant execute on function public.match_and_create(uuid[],text,uuid[],text) to service_role;

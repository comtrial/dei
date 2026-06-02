-- 20260602000030_match_and_create.sql
-- 명세 §7. 양측 멤버를 받아 (필요시 synthetic team 생성 →) group_match+room+멤버 원자 생성.
-- 반환 = group_match.id (성사) / null (동시 같은 쌍 멱등 흡수). 거부는 raise exception.
create or replace function public.match_and_create(
  p_side_a_user_ids uuid[], p_side_a_gender text,
  p_side_b_user_ids uuid[], p_side_b_gender text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_a uuid; v_team_b uuid; v_tmp uuid; v_room uuid; v_gm uuid; v_cnt int;
begin
  if array_length(p_side_a_user_ids,1) is null or array_length(p_side_b_user_ids,1) is null then
    raise exception 'empty_side';
  end if;
  if p_side_a_gender = p_side_b_gender then raise exception 'same_gender'; end if;
  -- 상한 검증(명세 §5): 각 side <= side_max, 합 <= cell_cap
  if array_length(p_side_a_user_ids,1) > public.match_cfg_int('side_max',5)
     or array_length(p_side_b_user_ids,1) > public.match_cfg_int('side_max',5)
     or (array_length(p_side_a_user_ids,1)+array_length(p_side_b_user_ids,1)) > public.match_cfg_int('cell_cap',8) then
    raise exception 'over_capacity';
  end if;
  -- 가용성 재검증: 양측 전원 NOT is_in_active_room
  if exists (select 1 from public.profile p
             where p.user_id = any(p_side_a_user_ids || p_side_b_user_ids) and p.is_in_active_room) then
    raise exception 'member_busy';
  end if;

  -- side A 팀 구성: 1명이고 기존 user 팀이면 그 팀, 아니면 synthetic
  v_team_a := public._ensure_side_team(p_side_a_user_ids, p_side_a_gender);
  v_team_b := public._ensure_side_team(p_side_b_user_ids, p_side_b_gender);

  -- canonical (team_a_id < team_b_id)
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
  update public.profile set is_in_active_room = true
    where user_id = any(p_side_a_user_ids || p_side_b_user_ids);
  update public.team set status='locked' where id in (v_team_a, v_team_b);
  -- 관련 팀의 waiting 큐를 matched 로 (직접 호출/관리자 편성 경로에서도 일관). all-or-nothing.
  update public.match_queue set status='matched', matched_at=now()
    where team_id in (v_team_a, v_team_b) and status='waiting';
  insert into public.room_lifecycle(room_id, event, detail)
    values(v_room, 'created', jsonb_build_object('match_id', v_gm));
  return v_gm;
exception
  when unique_violation then return null;  -- 동시 같은 쌍 멱등
end $$;

-- side 멤버 → team_id. 멤버 집합이 정확히 일치하는 기존 user-team 이 있으면 그 친구팀을
-- 그대로 한 side 로 재사용("한 side = 한 team" 불변식), 아니면 synthetic 으로 묶는다(solo merge).
create or replace function public._ensure_side_team(p_user_ids uuid[], p_gender text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_owner uuid := p_user_ids[1]; v_size int := array_length(p_user_ids,1);
begin
  -- 멤버 집합이 정확히 동일한 기존 user-team(forming/ready/matching) 재사용.
  --   = 그 팀 멤버 전원이 p_user_ids 안에 있고, 카운트도 동일.
  select t.id into v_team
    from public.team t
    where t.kind = 'user'
      and t.gender = p_gender
      and t.status in ('forming','ready','matching')
      and (select count(*) from public.team_member tm where tm.team_id = t.id) = v_size
      and not exists (
        select 1 from public.team_member tm
        where tm.team_id = t.id and tm.user_id <> all(p_user_ids)
      )
    order by t.created_at desc
    limit 1;
  if v_team is not null then return v_team; end if;

  -- 그 외 synthetic 팀 생성 (solo merge 또는 팀 표현)
  insert into public.team(owner_user_id, gender, target_size, status, kind)
    values(v_owner, p_gender, v_size, 'matching', 'synthetic')
    returning id into v_team;
  insert into public.team_member(team_id, user_id, role)
    select v_team, uid, case when uid = v_owner then 'owner' else 'member' end
    from unnest(p_user_ids) uid
    on conflict (team_id, user_id) do nothing;
  return v_team;
end $$;

revoke all on function public.match_and_create(uuid[],text,uuid[],text) from public, anon;
grant execute on function public.match_and_create(uuid[],text,uuid[],text) to authenticated;
revoke all on function public._ensure_side_team(uuid[],text) from public, anon;

-- 20260602000060_matching_security_hardening.sql
-- edge case 재검증(adversarial)에서 발견된 high-severity 보안/정합 버그 3건 수정.
--   SM-E7: 한 side 내/양 side 간 동일 user 중복(더블시트) → 언더사이즈 방 생성. 거부.
--   SM-E9/M12: 성별 위변조 — 서버가 클라가 보낸 gender 인자만 신뢰, profile.gender 재검증 없음.
--   CR-10: try_match 에 auth.uid() 소유 가드 없음 — 남의 큐 id 로 매칭 트리거 가능.
-- create or replace 로 기존 함수 본문만 교체(마이그레이션 히스토리 보존).

-- ════════════════════════════════════════════════════════════════════════════
-- 1) match_and_create — 더블시트 거부 + per-member 성별 재검증 추가
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.match_and_create(
  p_side_a_user_ids uuid[], p_side_a_gender text,
  p_side_b_user_ids uuid[], p_side_b_gender text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_a uuid; v_team_b uuid; v_tmp uuid; v_room uuid; v_gm uuid; v_cnt int;
  v_all uuid[] := p_side_a_user_ids || p_side_b_user_ids;
begin
  if array_length(p_side_a_user_ids,1) is null or array_length(p_side_b_user_ids,1) is null then
    raise exception 'empty_side';
  end if;
  if p_side_a_gender = p_side_b_gender then raise exception 'same_gender'; end if;

  -- ★SM-E7: 더블시트 거부 — 전체 user_id 에 중복이 있으면(한 side 내 or 양 side 간) 거부.
  --   array_length(distinct) 가 없으므로 unnest+distinct count 로 비교.
  if (select count(*) from unnest(v_all)) <> (select count(distinct u) from unnest(v_all) u) then
    raise exception 'duplicate_seat';
  end if;

  -- 상한 검증(명세 §5): 각 side <= side_max, 합 <= cell_cap
  if array_length(p_side_a_user_ids,1) > public.match_cfg_int('side_max',5)
     or array_length(p_side_b_user_ids,1) > public.match_cfg_int('side_max',5)
     or (array_length(p_side_a_user_ids,1)+array_length(p_side_b_user_ids,1)) > public.match_cfg_int('cell_cap',8) then
    raise exception 'over_capacity';
  end if;

  -- ★SM-E9/M12: 성별 위변조 재검증 — 각 멤버의 실제 profile.gender 가 그 side 의 주장 gender 와 일치해야.
  --   클라가 보낸 gender 인자만 믿지 않는다(서버 권위).
  if exists (
    select 1 from public.profile p
    where (p.user_id = any(p_side_a_user_ids) and p.gender is distinct from p_side_a_gender)
       or (p.user_id = any(p_side_b_user_ids) and p.gender is distinct from p_side_b_gender)
  ) then
    raise exception 'gender_mismatch';
  end if;
  -- 프로필이 아예 없는 user 도 거부(게이트 미충족)
  if (select count(*) from public.profile p where p.user_id = any(v_all)) <> array_length(v_all,1) then
    raise exception 'profile_missing';
  end if;

  -- 가용성 재검증: 양측 전원 NOT is_in_active_room
  if exists (select 1 from public.profile p
             where p.user_id = any(v_all) and p.is_in_active_room) then
    raise exception 'member_busy';
  end if;

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

-- ════════════════════════════════════════════════════════════════════════════
-- 2) try_match — auth.uid() 소유 가드 추가 (CR-10)
--    호출자가 그 큐의 팀 멤버이거나 service_role 일 때만 진행.
-- ════════════════════════════════════════════════════════════════════════════
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

  -- ★CR-10: 소유 가드 — auth.uid() 가 있으면(=사용자 호출) 그 큐 팀의 멤버여야 한다.
  --   service_role/내부 호출(auth.uid() IS NULL, sweep 대체·admin)은 통과.
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
      and (
        greatest(v_waited, floor(extract(epoch from (now()-q.enqueued_at))/60))
          >= public.match_cfg_int('tier2_minutes',120)
        or me.region is null or q.region is null or me.region = q.region
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

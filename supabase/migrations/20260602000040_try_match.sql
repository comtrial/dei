-- 20260602000040_try_match.sql
-- 명세 §4·§5. 큐 1건 기준 상대 후보를 Tier 완화로 찾아 매칭. solo merge 포함.
create or replace function public.try_match(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me record; cand record; v_tier int; v_waited int;
  v_my_ids uuid[]; v_other_ids uuid[]; v_gm uuid;
  v_side_max int := public.match_cfg_int('side_max',5);
  v_cap int := public.match_cfg_int('cell_cap',8);
begin
  -- gender-pair bucket advisory lock (동시 직렬화)
  perform pg_advisory_xact_lock(hashtext('match'));

  select q.*, t.target_size as t_size into me
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.id=p_queue_id and q.status='waiting' for update;
  if me is null then return null; end if;

  v_waited := floor(extract(epoch from (now()-me.enqueued_at))/60);
  v_tier := public._tier_of(v_waited);

  -- 후보: 반대 성별 waiting, region/tier 게이트, eff_prio 정렬
  select q.*, t.target_size as t_size, t.kind as t_kind into cand
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.status='waiting'
      and q.gender = me.required_gender
      and q.team_id <> me.team_id
      and (q.expires_at is null or q.expires_at > now())
      -- Tier0: 정확일치 / Tier1+: 합<=cap & 각<=side_max / region: T2 전엔 같은지역 선호
      and (
        (v_tier = 0 and q.desired_size = me.desired_size)
        or (v_tier >= 1 and (q.desired_size + me.desired_size) <= v_cap
            and q.desired_size <= v_side_max and me.desired_size <= v_side_max)
      )
      and (
        v_waited >= public.match_cfg_int('tier2_minutes',120)
        or me.region is null or q.region is null or me.region = q.region
      )
    order by (me.region is not distinct from q.region) desc, public._match_boost(q.enqueued_at) asc
    limit 1 for update skip locked;

  if cand is null then
    -- Tier1+ & me 가 solo 면 동성 solo 들을 모아 상대에 맞춤 (solo merge)
    if v_tier >= 1 and me.desired_size = 1 then
      return public._try_solo_merge(me.id, me.gender, me.required_gender, v_waited);
    end if;
    return null;  -- 대기 잔류
  end if;

  -- 양측 멤버 수집
  select array_agg(tm.user_id) into v_my_ids from public.team_member tm where tm.team_id=me.team_id;
  select array_agg(tm.user_id) into v_other_ids from public.team_member tm where tm.team_id=cand.team_id;

  -- 매칭 성사
  v_gm := public.match_and_create(v_my_ids, me.gender, v_other_ids, cand.gender);
  if v_gm is null then return null; end if;
  update public.match_queue set status='matched', matched_at=now()
    where id in (me.id, cand.id) and status='waiting';
  return v_gm;
end $$;

-- solo merge: 같은 성별 waiting solo 들을 모아 상대 성별 solo/team 과 매칭 (3:3 등)
create or replace function public._try_solo_merge(p_seed uuid, p_gender text, p_req text, p_waited int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  my_ids uuid[]; other_ids uuid[]; r record;
  v_my_q uuid[]; v_other_q uuid[]; v_gm uuid;
  v_side_max int := public.match_cfg_int('side_max',5);
  v_need int;
begin
  -- 내 쪽 solo 풀 (seed 포함), eff_prio 순 최대 side_max
  my_ids := array[]::uuid[]; v_my_q := array[]::uuid[];
  for r in select q.id, tm.user_id from public.match_queue q
             join public.team t on t.id=q.team_id
             join public.team_member tm on tm.team_id=t.id
             where q.status='waiting' and q.gender=p_gender and q.desired_size=1
               and (q.expires_at is null or q.expires_at > now())
             order by public._match_boost(q.enqueued_at) asc limit v_side_max for update skip locked loop
    my_ids := my_ids || r.user_id; v_my_q := v_my_q || r.id;
  end loop;
  -- 상대 쪽 solo 풀
  other_ids := array[]::uuid[]; v_other_q := array[]::uuid[];
  for r in select q.id, tm.user_id from public.match_queue q
             join public.team t on t.id=q.team_id
             join public.team_member tm on tm.team_id=t.id
             where q.status='waiting' and q.gender=p_req and q.desired_size=1
               and (q.expires_at is null or q.expires_at > now())
             order by public._match_boost(q.enqueued_at) asc limit v_side_max for update skip locked loop
    other_ids := other_ids || r.user_id; v_other_q := v_other_q || r.id;
  end loop;
  -- 균형: 양측 min 으로 맞춤 (3:3 등). 최소 1:1.
  v_need := least(array_length(my_ids,1), array_length(other_ids,1));
  if v_need is null or v_need < 1 then return null; end if;
  my_ids := my_ids[1:v_need]; other_ids := other_ids[1:v_need];
  v_my_q := v_my_q[1:v_need]; v_other_q := v_other_q[1:v_need];

  v_gm := public.match_and_create(my_ids, p_gender, other_ids, p_req);
  if v_gm is null then return null; end if;
  update public.match_queue set status='matched', matched_at=now()
    where id = any(v_my_q || v_other_q) and status='waiting';
  return v_gm;
end $$;

revoke all on function public.try_match(uuid) from public, anon;
grant execute on function public.try_match(uuid) to authenticated;
revoke all on function public._try_solo_merge(uuid,text,text,int) from public, anon;

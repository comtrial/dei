-- 20260602000050_matching_ops.sql
-- cron 없음. 운영 백도어 + lazy expire 헬퍼만. 명세 §8.

-- 운영진 수동 편성 (Phase 0). 두 팀의 멤버를 모아 match_and_create 직접 호출. Tier/큐 게이트 우회.
-- 반환 = group_match.id / null. 존재하지 않는 team 등은 match_and_create 가 raise(empty_side).
create or replace function public.admin_force_match(p_team_a uuid, p_team_b uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ga text; v_gb text; v_a_ids uuid[]; v_b_ids uuid[]; v_gm uuid;
begin
  select gender into v_ga from public.team where id=p_team_a;
  select gender into v_gb from public.team where id=p_team_b;
  select array_agg(user_id) into v_a_ids from public.team_member where team_id=p_team_a;
  select array_agg(user_id) into v_b_ids from public.team_member where team_id=p_team_b;
  v_gm := public.match_and_create(v_a_ids, v_ga, v_b_ids, v_gb);
  -- 해당 팀의 waiting 큐가 있으면 matched 로
  update public.match_queue set status='matched', matched_at=now()
    where team_id in (p_team_a, p_team_b) and status='waiting';
  return v_gm;
end $$;
revoke all on function public.admin_force_match(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_force_match(uuid,uuid) to service_role;

-- lazy expire: 호출 시점에 만료된 '내' 큐만 expired 로 (전역 cron 대체). 클라가 큐 화면 조회 시 호출.
create or replace function public.expire_my_stale_queue()
returns int language plpgsql security definer set search_path = public as $$
declare v_cnt int;
begin
  update public.match_queue set status='expired'
    where status='waiting' and expires_at is not null and expires_at < now()
      and team_id in (select team_id from public.team_member where user_id = auth.uid());
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;
revoke all on function public.expire_my_stale_queue() from public, anon;
grant execute on function public.expire_my_stale_queue() to authenticated;

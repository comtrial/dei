-- ════════════════════════════════════════════════════════════════════════════
-- HOTFIX: team_member RLS 무한재귀(42P17) 제거
-- ════════════════════════════════════════════════════════════════════════════
-- 증상(실기기 Sentry, 2026-06-03): 매칭 "참여" 직후 앱 EXC_BAD_ACCESS 크래시.
-- 근본 원인: team_member_select 정책이 정책 본문에서 team_member 를 다시
--   서브쿼리로 조회 → 그 서브쿼리도 같은 정책을 재평가 → 무한재귀 →
--   Postgres 가 42P17 "infinite recursion detected in policy for relation
--   team_member" 로 모든 team_member SELECT 를 500 으로 거절. queue 화면이
--   이 500 을 받아 realtime 채널 재구독 루프 → React passive effect 무한
--   재연결 → JS 스택오버플로우 → hermes EXC_BAD_ACCESS.
--
-- 수정: room_member 가 이미 쓰는 패턴(room_is_member, SECURITY DEFINER 헬퍼)
--   과 동일하게 team_member 도 SECURITY DEFINER 함수로 "내 팀 여부"를 판정해
--   RLS 재귀를 끊는다. SECURITY DEFINER 함수 내부 SELECT 는 RLS 를 타지 않으
--   므로 정책이 자기 자신을 재트리거하지 않는다.
--
-- 영향: team_member SELECT 가시성 규칙은 동일(내 행 + 내가 속한 팀의 멤버).
--   team/team_invite 등 team_member 를 참조하던 다른 정책들도 연쇄 재귀가
--   풀려 정상화된다.

-- 1) RLS 안 타는 SECURITY DEFINER 헬퍼 — "auth.uid() 가 이 팀의 멤버인가".
--    room_is_member 와 동일한 패턴(stable + security definer + search_path 고정).
create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_member tm
    where tm.team_id = p_team_id and tm.user_id = p_user_id
  );
$$;

revoke all on function public.is_team_member(uuid, uuid) from public, anon;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;

-- 2) 자기참조(무한재귀) 정책을 헬퍼 호출로 교체.
drop policy if exists team_member_select on public.team_member;
create policy team_member_select on public.team_member
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_team_member(team_id, auth.uid())
  );

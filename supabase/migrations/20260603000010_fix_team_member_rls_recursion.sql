-- 20260603000010_fix_team_member_rls_recursion.sql
--
-- team_member SELECT 정책의 무한재귀 수정 (CRITICAL — 실DB e2e 가 발견).
-- ────────────────────────────────────────────────────────────────────────────
-- 증상: user JWT 로 public.team_member 를 SELECT 하면
--   ERROR: infinite recursion detected in policy for relation "team_member"
-- 원인: 20260529000020 의 team_member_select 정책이 using 절 안에서 다시
--   public.team_member 를 SELECT → 그 내부 SELECT 가 또 같은 정책을 평가 → 재귀.
--     create policy team_member_select on public.team_member for select using (
--       user_id = auth.uid()
--       or exists (select 1 from public.team_member tm2 where ... )  ← 자기참조
--     );
-- 영향: 앱이 user client 로 team_member 를 조회하는 splash(app/index.tsx),
--   queue(app/(app)/queue.tsx), cancel-confirm 가 RLS 에러로 죽어 → 매칭 큐
--   사용자가 앱 재진입 시 "큐로 라우팅" 이 실패하고 홈으로 빠진다(catch 폴백).
--   ("웨이팅 화면이 안 보이고 홈으로 진입" 의 근본 원인.)
--
-- 해결: 자기참조를 SECURITY DEFINER 헬퍼(public.is_my_team_member)로 빼낸다.
--   헬퍼 본문의 SELECT 는 정의자 권한으로 RLS 를 우회하므로 정책 재평가가
--   일어나지 않는다(room_is_member 와 동일 패턴). 같은 헬퍼로 team_select_member
--   / team_invite_select / match_queue_select 의 team_member 참조도 통일한다.

-- "내가 이 팀의 멤버인가" — RLS 우회 헬퍼(재귀 차단).
create or replace function public.is_my_team_member(p_team_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_member tm
    where tm.team_id = p_team_id and tm.user_id = p_uid
  );
$$;

revoke all on function public.is_my_team_member(uuid, uuid) from public, anon;
grant execute on function public.is_my_team_member(uuid, uuid) to authenticated;

-- team_member: 본인 행 또는 같은 팀 멤버 (헬퍼로 재귀 제거).
drop policy if exists team_member_select on public.team_member;
create policy team_member_select on public.team_member
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_my_team_member(team_id, auth.uid())
  );

-- team: 소유자 또는 멤버 (동일 헬퍼로 통일).
drop policy if exists team_select_member on public.team;
create policy team_select_member on public.team
  for select to authenticated using (
    owner_user_id = auth.uid()
    or public.is_my_team_member(id, auth.uid())
  );

-- team_invite: 초대/피초대 당사자 또는 팀 멤버.
drop policy if exists team_invite_select on public.team_invite;
create policy team_invite_select on public.team_invite
  for select to authenticated using (
    inviter_user_id = auth.uid()
    or invitee_user_id = auth.uid()
    or public.is_my_team_member(team_id, auth.uid())
  );

-- match_queue: 본인 팀 큐만 (헬퍼로 통일 — splash/queue 라우팅이 의존).
drop policy if exists match_queue_select on public.match_queue;
create policy match_queue_select on public.match_queue
  for select to authenticated using (
    public.is_my_team_member(team_id, auth.uid())
  );

-- Phase 4 (RLS) — rooms v2 RLS 골격.
--
-- 원칙(A 거버넌스): 방 도메인은 room_is_member() 단일 게이트. 본인 데이터는
-- 본인만. 상태 전이는 RPC/Edge(security definer)로 — 클라 직접 mutation 은
-- RLS 로 차단(방어선). 세부 정책은 각 작업자가 디벨롭.

-- 전 테이블 RLS 활성화
alter table public.profile              enable row level security;
alter table public.auth_verification    enable row level security;
alter table public.team                 enable row level security;
alter table public.team_member          enable row level security;
alter table public.team_invite          enable row level security;
alter table public.match_queue          enable row level security;
alter table public.group_match          enable row level security;
alter table public.match_member         enable row level security;
alter table public.room                 enable row level security;
alter table public.room_member          enable row level security;
alter table public.room_lifecycle       enable row level security;
alter table public.video                enable row level security;
alter table public.message              enable row level security;
alter table public.message_mention      enable row level security;
alter table public.block                enable row level security;
alter table public.report               enable row level security;
alter table public.payment              enable row level security;
alter table public.pass                 enable row level security;
alter table public.notification_setting enable row level security;
alter table public.refund_ticket        enable row level security;
alter table public.audit                enable row level security;

-- ── profile: authenticated read (매칭/방에서 상대 프로필 조회), 본인만 write ──
create policy profile_select on public.profile
  for select to authenticated using (true);
create policy profile_update_self on public.profile
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── auth_verification: 본인만 ──
create policy authver_select_self on public.auth_verification
  for select to authenticated using (user_id = auth.uid());

-- ── team / team_member / team_invite: 멤버만 SELECT ──
create policy team_select_member on public.team
  for select to authenticated using (
    owner_user_id = auth.uid()
    or exists (select 1 from public.team_member tm where tm.team_id = id and tm.user_id = auth.uid())
  );
create policy team_member_select on public.team_member
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.team_member tm2 where tm2.team_id = team_id and tm2.user_id = auth.uid())
  );
create policy team_invite_select on public.team_invite
  for select to authenticated using (
    inviter_user_id = auth.uid() or invitee_user_id = auth.uid()
    or exists (select 1 from public.team_member tm where tm.team_id = team_id and tm.user_id = auth.uid())
  );

-- ── match_queue: 본인 팀 큐만 ──
create policy match_queue_select on public.match_queue
  for select to authenticated using (
    exists (select 1 from public.team_member tm where tm.team_id = team_id and tm.user_id = auth.uid())
  );

-- ── group_match / match_member: 매칭 당사자만 ──
create policy group_match_select on public.group_match
  for select to authenticated using (
    exists (select 1 from public.match_member mm where mm.match_id = id and mm.user_id = auth.uid())
  );
create policy match_member_select on public.match_member
  for select to authenticated using (
    exists (select 1 from public.match_member mm2 where mm2.match_id = match_id and mm2.user_id = auth.uid())
  );

-- ── room / room_member / room_lifecycle / video / message: room_is_member 게이트 ──
create policy room_select_member on public.room
  for select to authenticated using (public.room_is_member(id, auth.uid()) or public.is_admin());

create policy room_member_select on public.room_member
  for select to authenticated using (public.room_is_member(room_id, auth.uid()) or public.is_admin());
create policy room_member_update_self on public.room_member
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy room_lifecycle_select on public.room_lifecycle
  for select to authenticated using (public.room_is_member(room_id, auth.uid()) or public.is_admin());

create policy video_select_member on public.video
  for select to authenticated using (public.room_is_member(room_id, auth.uid()));

-- message: 방 멤버 + 상대와 차단관계 아님. 귓속말은 발신/수신/멤버.
create policy message_select_member on public.message
  for select to authenticated using (
    public.room_is_member(room_id, auth.uid())
    and not public.is_blocked_between(auth.uid(), user_id)
    and (whisper_to_user_id is null or whisper_to_user_id = auth.uid() or user_id = auth.uid())
  );
create policy message_insert_member on public.message
  for insert to authenticated with check (
    public.room_is_member(room_id, auth.uid()) and user_id = auth.uid()
  );
create policy message_mention_select on public.message_mention
  for select to authenticated using (
    exists (select 1 from public.message m where m.id = message_id and public.room_is_member(m.room_id, auth.uid()))
  );

-- ── block / report: 본인 관련 ──
create policy block_select_self on public.block
  for select to authenticated using (blocker_user_id = auth.uid() or blocked_user_id = auth.uid());
create policy block_insert_self on public.block
  for insert to authenticated with check (blocker_user_id = auth.uid());
create policy report_select_self on public.report
  for select to authenticated using (reporter_user_id = auth.uid() or public.is_admin());
create policy report_insert_self on public.report
  for insert to authenticated with check (reporter_user_id = auth.uid());

-- ── payment / pass / notification_setting / refund_ticket: 본인만 ──
create policy payment_select_self on public.payment
  for select to authenticated using (user_id = auth.uid());
create policy pass_select_self on public.pass
  for select to authenticated using (user_id = auth.uid());
create policy notif_setting_all_self on public.notification_setting
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy refund_select_self on public.refund_ticket
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy refund_insert_self on public.refund_ticket
  for insert to authenticated with check (user_id = auth.uid());

-- ── audit: admin 만 ──
create policy audit_select_admin on public.audit
  for select to authenticated using (public.is_admin());

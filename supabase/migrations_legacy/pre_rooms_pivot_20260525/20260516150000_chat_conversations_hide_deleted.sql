-- ============================================================
-- 채팅 결함 수정 #1 (실DB e2e 발견)
-- ------------------------------------------------------------
-- conversations_select_participant_unblocked 정책에 status 필터가
-- 없어, leave_conversation 으로 DELETED 된 conversation row 가
-- 여전히 참여자에게 SELECT 가시였다 (메시지 내용은 messages.deleted_at
-- 으로 비가시였으나, conversation 행 자체가 노출 — 심층방어 갭).
--
-- 클라이언트는 status<>'DELETED' 로 거르므로 UX 영향은 없었지만,
-- RLS 레벨에서도 DELETED 를 숨겨 서버 단 방어선을 강화한다.
--
-- 멱등: drop policy if exists + create policy (재적용 안전).
-- additive — 다른 테이블/작업자 객체 무관.
-- ============================================================

drop policy if exists "conversations_select_participant_unblocked" on public.conversations;
create policy "conversations_select_participant_unblocked"
  on public.conversations for select to authenticated
  using (
    (
      (user_a_id = auth.uid() or user_b_id = auth.uid())
      and status <> 'DELETED'
      and not public.chat_is_blocked_between(user_a_id, user_b_id)
    )
    or public.is_admin()
  );

/**
 * 10-D · 푸시 알림 → 채팅방 직진입 (deeplink) 라우팅 seam.
 *
 * FULL-spec 근거 (CH0 컨텍스트 + transitions, payload/condition 권위):
 *   - `[CH0]push_notification_chat_tapped` (trigger=EXTERNAL_SIGNAL_RECEIVED):
 *       · condition 'conversations 중 status=ACTIVE 가 1건 이상' → NAVIGATE CTX[CH1]
 *       · condition 'ACTIVE conversation 0건'                  → NAVIGATE CTX[CH3]
 *   - 단, CH0 purpose: "LK8 / OP3 / H2 탭바 / **푸시 알림** 4개 진입점에서
 *     conversation_id 를 해석 → blocks 양방향 + conversations.status 판정 후
 *     CH2/토스트/CH1 분기. 모든 채팅 진입의 단일 게이트."
 *   - B-CH1: 모든 채팅 진입(…푸시 알림 deeplink)은 CH0 라우터를 거쳐 차단
 *     사전 검증 통과 후에만 CH2 마운트.
 *
 * 따라서 푸시 tap 의 라우팅은 두 갈래:
 *   1) deeplink 에 conversationId 가 실리면 → CH0 라우터(/chat, source=push).
 *      CH0 가 차단/상태(ENTERED/BLOCKED/ENDED/NOT_FOUND)를 최종 판정 →
 *      만료/차단 시 라우터가 흡수(토스트 + H2/CH1).
 *   2) conversationId 가 없는 일반 "채팅 왔어요" 알림이면 →
 *      activeConversationCount 로 CH1(>0) / CH3(=0) 분기.
 *
 * 푸시 인프라(expo-notifications 토큰 등록/수신 핸들러)는 이 앱에 아직
 * 없다(`hooks/useNotifications.ts` 는 stub). 이 모듈은 **deeplink payload →
 * 라우트 결정** 의 순수 로직만 책임지며, 실제 OS 푸시 등록/탭 핸들러는
 * 별도 인프라 작업이다(부재 사실 명시). I/O 없음 → Vitest 단위 대상.
 */
import { ROUTES } from '@/lib/routes';

/** 푸시 알림 payload (서버가 data 로 실어 보내는 최소 형태). */
export interface ChatPushPayload {
  /** 'chat' 인 알림만 채팅 deeplink 로 처리. */
  type?: string;
  /** 해당 대화 id. 없으면 목록/빈상태로. */
  conversationId?: string | null;
}

export type PushRouteTarget =
  | { pathname: typeof ROUTES.chatRoute; params: { conversationId: string; source: 'push' } }
  | { pathname: typeof ROUTES.messages }
  | { pathname: typeof ROUTES.record /* CH3 빈 상태의 CTA 목적지가 아니라 CH3 자체 */ }
  | { pathname: typeof ROUTES.messages; reason: 'empty' }
  | null;

export interface ResolvePushInput {
  payload: ChatPushPayload | null | undefined;
  /** status=ACTIVE 인 conversation 수 (서버/캐시에서 사전 조회). */
  activeConversationCount: number;
}

/**
 * 푸시 deeplink → 라우트 결정.
 *
 *   - payload.type !== 'chat'           → null (채팅 라우팅 아님; 호출부 무시)
 *   - conversationId 있음                → CH0 라우터(/chat, source=push).
 *                                          CH0 가 BLOCKED/ENDED/NOT_FOUND 흡수.
 *   - conversationId 없음 + active > 0   → CH1 목록(/messages)
 *   - conversationId 없음 + active = 0   → CH1 진입(목록 화면). 화면이 0건이면
 *                                          스스로 CH3 빈 상태를 렌더(messages.tsx).
 *
 * (CH3 는 독립 라우트가 아니라 messages 화면의 0건 분기이므로, 목적지는
 *  /messages 로 통일하되 reason='empty' 표식만 다르게 둔다 — 스펙의
 *  "conversation_count=0 → CH3" 의도를 화면 분기로 충족.)
 */
export function resolvePushChatRoute({
  payload,
  activeConversationCount,
}: ResolvePushInput): PushRouteTarget {
  if (!payload || payload.type !== 'chat') {
    return null;
  }

  const conversationId = payload.conversationId?.trim() || null;
  if (conversationId) {
    return {
      pathname: ROUTES.chatRoute,
      params: { conversationId, source: 'push' },
    };
  }

  if (activeConversationCount > 0) {
    return { pathname: ROUTES.messages };
  }
  return { pathname: ROUTES.messages, reason: 'empty' };
}

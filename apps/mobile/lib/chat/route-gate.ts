/**
 * CH0 · 채팅 진입 라우터 + 차단/상태 게이트 (순수 판정 로직).
 *
 * 권위 스펙: missoula-FULL-spec.json transitions (chat_route_resolved):
 *   - outcome=ENTERED : 차단 없음 AND conversation.status=ACTIVE → CH2
 *   - outcome=BLOCKED : 차단 존재 → "더 이상 대화할 수 없습니다" → navigate H2(home)
 *   - outcome=ENDED   : status ∈ {ENDED, DELETED} → "종료된 대화입니다" → navigate CH1(목록)
 *   - conversation 없음 / 미해석                              → CH1 (또는 0건이면 CH3)
 *
 * (BLOCKED 와 ENDED 목적지가 다름 — BLOCKED=H2, ENDED=CH1. 분기 판정은
 *  이 순수 함수가, 실제 navigate 목적지는 app/(app)/chat.tsx 가 수행.)
 *
 * I/O (네트워크) 는 호출부에서 수행하고, 그 결과만 이 함수로 판정한다 →
 * Vitest 단위 테스트 대상 (CLAUDE.md Testing: 순수 로직 = Vitest).
 */
import type { ConversationStatus } from './types';

export type ChatRouteOutcome = 'ENTERED' | 'BLOCKED' | 'ENDED' | 'NOT_FOUND';

export interface ChatRouteResolution {
  outcome: ChatRouteOutcome;
  conversationId: string | null;
  /** 사용자에게 보여줄 토스트 메시지 (BLOCKED / ENDED). */
  toast: string | null;
}

export interface ChatRouteInput {
  /** 진입점에서 해석된 conversation id. null = 해석 실패. */
  conversationId: string | null;
  /** conversations row 조회 결과. null = 조회 실패/미존재 (RLS 차단 포함). */
  conversation: {
    status: ConversationStatus;
  } | null;
  /** blocks 테이블 양방향 조회 결과 (true = 차단 존재). */
  isBlocked: boolean;
}

// FULL-spec chat_route_resolved payload_json 의 정확 문자열과 1:1 정합
// (PM 검증서 P1-6). BLOCKED payload: {"message":"더 이상 대화할 수 없습니다"},
// ENDED payload: {"message":"종료된 대화입니다"}.
export const CHAT_TOAST = {
  blocked: '더 이상 대화할 수 없습니다',
  ended: '종료된 대화입니다',
} as const;

/**
 * CH0 분기 판정. 우선순위:
 *   1) conversationId 미해석 / conversation 미존재 → NOT_FOUND (CH1 로)
 *   2) 차단 존재 → BLOCKED (차단 토스트 + CH1)
 *   3) status ∈ {ENDED, DELETED} → ENDED (종료 토스트 + CH1)
 *   4) 그 외 (status=ACTIVE, 미차단) → ENTERED (CH2)
 *
 * 차단을 상태보다 먼저 보는 이유: 차단이면 RLS 로 conversation 조회 자체가
 * null 일 수 있으나, blocks 를 별도로 조회해 명시적 차단 토스트를 띄운다.
 */
export function resolveChatRoute(input: ChatRouteInput): ChatRouteResolution {
  const { conversationId, conversation, isBlocked } = input;

  if (isBlocked) {
    return { outcome: 'BLOCKED', conversationId, toast: CHAT_TOAST.blocked };
  }

  if (!conversationId || !conversation) {
    return { outcome: 'NOT_FOUND', conversationId: conversationId ?? null, toast: null };
  }

  if (conversation.status === 'ENDED' || conversation.status === 'DELETED') {
    return { outcome: 'ENDED', conversationId, toast: CHAT_TOAST.ended };
  }

  return { outcome: 'ENTERED', conversationId, toast: null };
}

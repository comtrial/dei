/**
 * OP3 · 상대 프로필 (매칭 후 전체 공개) cross-WF 진입 seam.
 *
 * FULL-spec 근거 (transitions, payload_json/condition 권위):
 *   - 10-G: `[CH4]chat_view_profile_tapped` → NAVIGATE_TO_ANOTHER_CONTEXT
 *           → CTX[OP3] (branch "CH4 → OP3 (사용자 결정 #4)")
 *   - 10-G alt: `[CH2]chat_header_avatar_tapped` → NAVIGATE_TO_ANOTHER_CONTEXT
 *           → CTX[OP3] (branch "CH2 헤더 → OP3")
 *   - 10-C: `[OP3]op3_chat_tapped` → CH0 라우터 (반대 방향. enter-chat.ts 가 담당)
 *
 * OP3 화면 자체는 **상대 프로필 워크플로(06)** 소관이며 이 앱(채팅 모듈)에는
 * 아직 OP3 라우트가 없다. 핵심 funnel 의 LK8 seam 패턴(enter-chat.ts)과 동일하게:
 *   - OP3 라우트가 존재하면 그쪽으로 navigate (params: otherUserId)
 *   - 없으면 funnel 을 막지 않고 안전 degrade (false 반환 → 호출부가 안내)
 * 진입 트리거/seam 을 한 곳(이 순수 함수)에 모아 Vitest 로 단언 가능하게 한다.
 *
 * I/O 없음(순수) — expo-router push 시그니처만 의존.
 */
import { ROUTES } from '@/lib/routes';

/** ROUTES 에 OP3(매칭 후 상대 프로필) 라우트가 생기면 여기에 키를 추가한다. */
const OP3_ROUTE: string | null =
  (ROUTES as Record<string, string>).opponentProfile ?? null;

export type ProfileRouterPush = (target: {
  pathname: string;
  params: Record<string, string>;
}) => void;

export interface EnterOpponentProfileInput {
  /** 매칭 상대 user id (OP3 가 프로필을 그릴 키). */
  otherUserId: string | null;
  /** 진입점 표식: 'ch4-sheet'(10-G) | 'ch2-header'(10-G alt). */
  source: 'ch4-sheet' | 'ch2-header';
  conversationId?: string | null;
}

export interface EnterOpponentProfileResult {
  /** OP3 로 실제 navigate 했는가. false = 라우트 부재 → 안전 degrade. */
  routed: boolean;
  /** routed=false 일 때 호출부가 노출할 안내 (FULL-spec 의도: 프로필 진입점). */
  degradeMessage: string | null;
}

/**
 * CH2 헤더 / CH4 "상대 프로필 보기" → OP3 cross-WF 진입.
 *
 * - OP3 라우트 + otherUserId 둘 다 있으면 push 하고 routed:true.
 * - 라우트가 없으면(현 상태) push 하지 않고 routed:false + 안내 메시지 — funnel
 *   비차단. otherUserId 가 없어도(식별 불가) 동일하게 degrade.
 */
export function enterOpponentProfile(
  push: ProfileRouterPush,
  { otherUserId, source, conversationId = null }: EnterOpponentProfileInput,
): EnterOpponentProfileResult {
  if (!OP3_ROUTE || !otherUserId) {
    return {
      routed: false,
      degradeMessage: '상대 프로필 화면은 매칭 프로필(OP3) 연결 후 제공됩니다.',
    };
  }
  push({
    pathname: OP3_ROUTE,
    params: {
      otherUserId,
      source,
      ...(conversationId ? { conversationId } : {}),
    },
  });
  return { routed: true, degradeMessage: null };
}

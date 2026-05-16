/**
 * LK8 / OP3 매칭 후 → CH0 채팅 라우터 진입.
 *
 * 스펙 user_flow:
 *   - "10-A 매칭 직후 채팅 진입 e2e (LK8)" : `[LK8]match_chat_open_tapped`
 *     → TRIGGER_NEXT_EVENT → `[CH0]chat_route_evaluating` (source=lk8)
 *   - "10-C OP3 매칭 후 프로필 → 채팅 진입" : `[OP3]op3_chat_tapped`
 *     → TRIGGER_NEXT_EVENT → `[CH0]chat_route_evaluating` (source=op3).
 *     FULL-spec 10-C: 같은 CH0 통합 라우터 검증 — ENTERED→CH2 /
 *     BLOCKED→"더 이상 대화할 수 없습니다"→H2 / ENDED→"종료된 대화입니다"→CH1.
 *
 * LK8(매칭 완료 화면)·OP3(매칭 후 상대 프로필) 자체는 각각 매칭/상대 프로필
 * 워크플로 소관이지만, **그 지점에서 CH0 라우터(`/chat`)를 호출하는 연결**이
 * 채팅 funnel 의 진입 트리거다. 핵심 funnel 의 LK8 패턴과 동일하게 그 연결을
 * 한 곳(이 순수 함수)에 모아 진입점(source)만 바꿔 재사용한다 — OP3 화면이
 * 이 앱에 생기면 그 "채팅하기" 콜백이 source='op3' 로 이 함수를 호출하면 된다.
 *
 * I/O 없음(순수). expo-router 의 push 시그니처만 의존 → Vitest 단위 대상.
 */
import { ROUTES } from '@/lib/routes';

/** expo-router `useRouter().push` 의 최소 형태 (테스트에서 mock 가능). */
export type ChatRouterPush = (target: {
  pathname: string;
  params: Record<string, string>;
}) => void;

export interface EnterChatFromMatchInput {
  conversationId: string | null;
  /** LK8 진입은 'lk8'. (목록 진입은 messages 화면이 'list' 로 직접 호출.) */
  source?: string;
}

/**
 * 매칭 완료 직후 채팅 진입.
 *
 * conversationId 가 없으면(매칭은 됐으나 conversation 미발급 등) 라우팅하지
 * 않고 false 를 반환 — 호출부가 안전 degrade(목록/안내) 결정.
 * conversationId 가 있으면 CH0 라우터로 push 하고 true 반환. CH0 가 차단/
 * 상태 게이트(resolveChatRoute)를 최종 판정한다.
 */
export function enterChatFromMatch(
  push: ChatRouterPush,
  { conversationId, source = 'lk8' }: EnterChatFromMatchInput,
): boolean {
  if (!conversationId) return false;
  push({
    pathname: ROUTES.chatRoute,
    params: { conversationId, source },
  });
  return true;
}

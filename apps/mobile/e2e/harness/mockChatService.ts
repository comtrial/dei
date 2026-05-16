/**
 * Deterministic in-memory chat data layer for the Playwright web harness.
 *
 * The harness renders the *real* chat screens/components (CH1/CH2/CH4/CH5)
 * but swaps the Supabase-backed `@/lib/chat/chat-service` for this module via
 * a Vite alias (see e2e/playwright/vite.config.ts). That keeps the DOM-level
 * assertions hermetic — no Docker / no network — while still exercising the
 * production UI logic the spec cares about (composer 글자수/전송/실패 retry,
 * 빈 상태, 더보기, 나가기 다이얼로그, realtime 무음 정리).
 *
 * Scenario selection is driven by `window.__CHAT_SCENARIO__` (set by the
 * harness HTML / query string) so each Playwright spec can pick a fixture.
 */
import type {
  ChatListItem,
  MessageRow,
  SendMessageResult,
} from '@/lib/chat/types';
import { classifySendFailure, type SendFailure } from '@/lib/chat/message';

export type SendOk = { ok: true; message: SendMessageResult };
export type SendErr = { ok: false; failure: SendFailure };
export type RealtimeUnsubscribe = () => void;

export interface ConversationGate {
  conversation: { status: 'ACTIVE' | 'ENDED' | 'DELETED'; otherUserId: string } | null;
  isBlocked: boolean;
}

type Scenario =
  | 'list-populated'
  | 'list-empty'
  | 'list-error'
  | 'room-basic'
  | 'room-send-fail-retry'
  | 'room-send-fail-blocked'
  | 'room-send-fail-invalid'
  | 'room-ended-incoming'
  | 'gate-entered'
  | 'gate-blocked'
  | 'gate-ended'
  | 'gate-not-found';

declare global {
  // eslint-disable-next-line no-var
  var __CHAT_SCENARIO__: Scenario | undefined;
}

function scenario(): Scenario {
  return (globalThis.__CHAT_SCENARIO__ as Scenario) ?? 'list-populated';
}

const ME = 'me-user-id';
const OTHER = 'other-user-id';
const CONV = 'conv-fixture-1';

const baseList: ChatListItem[] = [
  {
    conversationId: CONV,
    otherUserId: OTHER,
    otherNickname: '하늘',
    lastMessagePreview: '내일 봬요!',
    updatedAt: new Date('2026-05-16T09:30:00Z').toISOString(),
    status: 'ACTIVE',
  },
  {
    conversationId: 'conv-fixture-2',
    otherUserId: 'other-2',
    otherNickname: '바다',
    lastMessagePreview: null,
    updatedAt: new Date('2026-05-15T22:10:00Z').toISOString(),
    status: 'ACTIVE',
  },
];

export async function fetchChatList(): Promise<ChatListItem[]> {
  const s = scenario();
  if (s === 'list-empty') return [];
  if (s === 'list-error') throw new Error('mock: failed to load conversations');
  return baseList;
}

export async function loadConversationGate(): Promise<ConversationGate> {
  // CH0 게이트 분기를 e2e-web 으로 실제 코드 경로(resolveChatRoute +
  // chat.tsx navigate)로 검증하기 위한 시나리오들 (P0-2).
  switch (scenario()) {
    case 'gate-blocked':
      // RLS 로 conversation 미조회 + 양방향 차단 → BLOCKED → navigate H2.
      return { conversation: null, isBlocked: true };
    case 'gate-ended':
      return {
        conversation: { status: 'ENDED', otherUserId: OTHER },
        isBlocked: false,
      };
    case 'gate-not-found':
      return { conversation: null, isBlocked: false };
    case 'gate-entered':
    default:
      return {
        conversation: { status: 'ACTIVE', otherUserId: OTHER },
        isBlocked: false,
      };
  }
}

export async function fetchMessages(): Promise<MessageRow[]> {
  if (scenario() === 'room-basic') {
    return [
      {
        id: 'm1',
        conversation_id: CONV,
        sender_user_id: OTHER,
        body: '안녕하세요, 반가워요',
        status: 'SENT',
        deleted_at: null,
        created_at: new Date('2026-05-16T09:00:00Z').toISOString(),
      },
      {
        id: 'm2',
        conversation_id: CONV,
        sender_user_id: ME,
        body: '저도 반가워요',
        status: 'SENT',
        deleted_at: null,
        created_at: new Date('2026-05-16T09:01:00Z').toISOString(),
      },
    ];
  }
  return [];
}

let sendCallCount = 0;

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<SendOk | SendErr> {
  sendCallCount += 1;

  if (scenario() === 'room-send-fail-retry') {
    // First attempt fails (retryable network), retry (2nd call) succeeds — 10-E.
    if (sendCallCount === 1) {
      return {
        ok: false,
        failure: classifySendFailure({ message: 'mock transient', retryable: true }),
      };
    }
  }

  if (scenario() === 'room-send-fail-blocked') {
    // 비재시도 실패 (차단). retry 마커 미노출 + 토스트 + 방 종료 (P0-3/P0-4).
    return {
      ok: false,
      failure: classifySendFailure({ reason: 'BLOCKED', retryable: false }),
    };
  }

  if (scenario() === 'room-send-fail-invalid') {
    // 비재시도 실패 (길이 위반). retry 마커 미노출 + 토스트, 방은 유지
    // (사용자가 줄여서 다시 보낼 수 있어야 함 — INVALID 영구 마커 버그 회귀).
    return {
      ok: false,
      failure: classifySendFailure({
        message: 'message body must be 1..500 chars',
      }),
    };
  }

  return {
    ok: true,
    message: {
      id: `srv-${sendCallCount}`,
      conversation_id: conversationId,
      sender_user_id: ME,
      body,
      status: 'SENT',
      created_at: new Date().toISOString(),
    },
  };
}

export async function leaveConversation(): Promise<void> {
  // Resolves — chat-room replaces back to the list on success.
  return;
}

type EndedHandler = { onConversationEnded: () => void; onMessage: (m: MessageRow) => void };
const endedHandlers = new Set<EndedHandler>();

export function subscribeConversation(
  _conversationId: string,
  handlers: EndedHandler,
): RealtimeUnsubscribe {
  endedHandlers.add(handlers);

  if (scenario() === 'room-ended-incoming') {
    // Simulate the peer leaving shortly after entering the room (CH-RT
    // conversation_ended_received → B-CH6 무음 정리 / 10-H).
    setTimeout(() => {
      endedHandlers.forEach((h) => h.onConversationEnded());
    }, 400);
  }

  return () => {
    endedHandlers.delete(handlers);
  };
}

/** Test-only reset so Playwright can re-run scenarios cleanly. */
export function __resetMockChatService(): void {
  sendCallCount = 0;
  endedHandlers.clear();
}

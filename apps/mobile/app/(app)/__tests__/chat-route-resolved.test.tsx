/**
 * CH0 라우터(chat.tsx)의 NSM funnel 계측 검증: chat_route_resolved.
 *
 * route-gate(resolveChatRoute, 순수함수)가 만든 ChatRouteResolution.outcome 을
 * 그대로 analytics.capture('chat_route_resolved', ...) 로 넘기는지 확인한다.
 * 라우팅 목적지 자체(replace 경로)는 route-gate 단위테스트가 별도로 보장하므로,
 * 여기서는 outcome 별 capture 인자만 검증한다.
 */
import { render, waitFor } from '@testing-library/react-native';

import ChatRouteGate from '../chat';
import { analytics } from '@dei/shared';
import { loadConversationGate } from '@/lib/chat/chat-service';

// expo-router: useFocusEffect 는 마운트 시 콜백을 즉시 실행 (useEffect 시맨틱).
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(cb, []);
    },
    useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
    useLocalSearchParams: () => mockSearchParams,
  };
});

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

jest.mock('@/lib/chat/chat-service', () => ({
  loadConversationGate: jest.fn(),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  logger: {
    addBreadcrumb: jest.fn(),
    // withErrorCapture: 단순히 fn 을 실행하고 결과 Promise 반환.
    withErrorCapture: (_name: string, fn: () => unknown) => Promise.resolve(fn()),
  },
}));

const captureMock = analytics.capture as jest.Mock;
const loadGateMock = loadConversationGate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = {};
});

describe('chat_route_resolved 계측 (CH0 NSM funnel)', () => {
  it('ENTERED: ACTIVE + 미차단 → outcome=ENTERED + conversation_id', async () => {
    mockSearchParams = { conversationId: 'c1', source: 'lk8' };
    loadGateMock.mockResolvedValue({
      conversation: { status: 'ACTIVE', otherUserId: 'u2' },
      isBlocked: false,
    });

    render(<ChatRouteGate />);

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith('chat_route_resolved', {
        outcome: 'ENTERED',
        conversation_id: 'c1',
      });
    });
  });

  it('BLOCKED: 차단 존재 → outcome=BLOCKED', async () => {
    mockSearchParams = { conversationId: 'c1' };
    loadGateMock.mockResolvedValue({
      conversation: { status: 'ACTIVE', otherUserId: 'u2' },
      isBlocked: true,
    });

    render(<ChatRouteGate />);

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith('chat_route_resolved', {
        outcome: 'BLOCKED',
        conversation_id: 'c1',
      });
    });
  });

  it('ENDED: status=ENDED → outcome=ENDED', async () => {
    mockSearchParams = { conversationId: 'c1' };
    loadGateMock.mockResolvedValue({
      conversation: { status: 'ENDED', otherUserId: 'u2' },
      isBlocked: false,
    });

    render(<ChatRouteGate />);

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith('chat_route_resolved', {
        outcome: 'ENDED',
        conversation_id: 'c1',
      });
    });
  });

  it('NOT_FOUND: conversationId 미해석 → outcome=NOT_FOUND + conversation_id undefined', async () => {
    mockSearchParams = {}; // conversationId 없음
    // conversationId 가 없으면 loadConversationGate 를 호출하지 않는다.

    render(<ChatRouteGate />);

    await waitFor(() => {
      expect(captureMock).toHaveBeenCalledWith('chat_route_resolved', {
        outcome: 'NOT_FOUND',
        conversation_id: undefined,
      });
    });
    expect(loadGateMock).not.toHaveBeenCalled();
  });
});

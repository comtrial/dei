/**
 * CH2 채팅방 화면(chat-room.tsx)의 NSM funnel 계측 검증: chat_room_opened.
 *
 * 첫 로드 완료(loading=false) 시점에 conversation 당 1회만 발화하고,
 * message_count / entry_point 가 올바르게 실리는지 확인한다. useChatRoom 은
 * mock 해 loading/messages 를 제어한다(훅 자체는 useChatRoom.test 가 검증).
 */
import { render, waitFor } from '@testing-library/react-native';

import ChatRoomScreen from '../chat-room';
import { analytics } from '@dei/shared';

let mockSearchParams: Record<string, string | undefined> = {};
let mockChatRoomState: {
  messages: { id: string; senderUserId: string }[];
  loading: boolean;
  ended: boolean;
};

jest.mock('expo-router', () => ({
  useFocusEffect: () => {},
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

jest.mock('@/hooks/useChatRoom', () => ({
  useChatRoom: () => ({
    messages: mockChatRoomState.messages,
    loading: mockChatRoomState.loading,
    ended: mockChatRoomState.ended,
    sendFailure: null,
    clearSendFailure: jest.fn(),
    send: jest.fn(),
    retry: jest.fn(),
    reload: jest.fn(),
  }),
}));

jest.mock('@/lib/chat/chat-service', () => ({
  fetchOtherProfile: jest.fn().mockResolvedValue(null),
  leaveConversation: jest.fn(),
}));

jest.mock('@/lib/chat/opponent-profile', () => ({
  enterOpponentProfile: jest.fn(() => ({ routed: true })),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  logger: {
    addBreadcrumb: jest.fn(),
    withErrorCapture: (_n: string, fn: () => unknown) => Promise.resolve(fn()),
  },
}));

const captureMock = analytics.capture as jest.Mock;
const roomOpenedCalls = () =>
  captureMock.mock.calls.filter((c) => c[0] === 'chat_room_opened');

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { conversationId: 'c1', otherUserId: 'u2' };
  mockChatRoomState = { messages: [], loading: false, ended: false };
});

describe('chat_room_opened 계측 (CH2 NSM funnel)', () => {
  it('로드 완료 시 conversation_id + message_count 로 1회 발화', async () => {
    mockChatRoomState = {
      messages: [
        { id: 'm1', senderUserId: 'me' },
        { id: 'm2', senderUserId: 'u2' },
      ],
      loading: false,
      ended: false,
    };
    mockSearchParams = { conversationId: 'c1', otherUserId: 'u2', source: 'lk8' };

    render(<ChatRoomScreen />);

    await waitFor(() => {
      expect(roomOpenedCalls()).toHaveLength(1);
    });
    expect(captureMock).toHaveBeenCalledWith('chat_room_opened', {
      conversation_id: 'c1',
      message_count: 2,
      entry_point: 'lk8',
    });
  });

  it('source 없으면 entry_point 은 undefined', async () => {
    mockSearchParams = { conversationId: 'c1', otherUserId: 'u2' };

    render(<ChatRoomScreen />);

    await waitFor(() => {
      expect(roomOpenedCalls()).toHaveLength(1);
    });
    expect(captureMock).toHaveBeenCalledWith('chat_room_opened', {
      conversation_id: 'c1',
      message_count: 0,
      entry_point: undefined,
    });
  });

  it('아직 로딩 중이면 발화하지 않음', async () => {
    mockChatRoomState = { messages: [], loading: true, ended: false };

    render(<ChatRoomScreen />);

    // 잠깐 기다려도 chat_room_opened 는 발화하지 않아야 한다.
    await new Promise((r) => setTimeout(r, 0));
    expect(roomOpenedCalls()).toHaveLength(0);
  });

  it('리렌더가 발생해도 conversation 당 1회만 발화', async () => {
    const { rerender } = render(<ChatRoomScreen />);
    await waitFor(() => {
      expect(roomOpenedCalls()).toHaveLength(1);
    });
    rerender(<ChatRoomScreen />);
    rerender(<ChatRoomScreen />);
    expect(roomOpenedCalls()).toHaveLength(1);
  });
});

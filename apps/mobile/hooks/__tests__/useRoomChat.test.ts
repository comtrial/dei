// apps/mobile/hooks/__tests__/useRoomChat.test.ts
//
// 훅은 React 런타임(useState/useEffect/useRef) 의존 → Jest + RNTL renderHook.
// (vitest 는 lib/ 만 소유: vitest.config include=lib/**, jest.config testMatch=hooks/**.)
// 플랜(Task 15)의 시나리오·단언은 그대로 두고 러너 관용만 Jest 로 표기.
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockSendRoomMessage = jest.fn();
jest.mock('@/lib/chat/send-message', () => ({
  sendRoomMessage: (...a: unknown[]) => mockSendRoomMessage(...a),
  // TS 파라미터 프로퍼티(`public code`)는 jest.mock 팩토리 호이스팅에서
  // out-of-scope 로 오인되어 Babel 이 거부 → 평범한 필드 대입으로 표현.
  SendMessageError: class SendMessageError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

const mockSubscribeRoomMessages = jest.fn((..._a: unknown[]) => () => {});
jest.mock('@/lib/realtime', () => ({
  subscribeRoomMessages: (...a: unknown[]) => mockSubscribeRoomMessages(...a),
}));

const mockTableRows: Record<string, unknown[]> = {
  message: [],
  profile: [],
  room_lifecycle: [],
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        in: jest.fn(() => query),
        order: jest.fn(() => query),
        limit: jest.fn(() =>
          Promise.resolve({ data: mockTableRows[table] ?? [], error: null }),
        ),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: mockTableRows[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
  },
}));

// 로깅/Sentry 는 항상 mock (CLAUDE.md) — 실패 경로 테스트의 콘솔 노이즈 차단.
jest.mock('@dei/shared', () => ({
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    addBreadcrumb: jest.fn(),
  },
}));

// jest.mock 팩토리는 import-under-test 보다 위에 와야 호이스팅이 올바르게 적용된다.
// eslint-disable-next-line import/first
import { useRoomChat } from '../useRoomChat';

beforeEach(() => {
  mockSendRoomMessage.mockReset();
  mockSubscribeRoomMessages.mockClear();
  mockTableRows.message = [];
  mockTableRows.profile = [];
  mockTableRows.room_lifecycle = [];
});

describe('useRoomChat', () => {
  it('reports initial loading until message history has been fetched', async () => {
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));

    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
  });

  it('adds optimistic bubble immediately then reconciles on success', async () => {
    mockSendRoomMessage.mockResolvedValue({
      message: {
        id: 's1',
        room_id: 'r',
        user_id: 'me',
        body: 'hi',
        whisper_to_user_id: null,
        created_at: 't',
      },
      deduped: false,
    });
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));
    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() => expect(result.current.messages.some((m) => m.id === 's1')).toBe(true));
    expect(result.current.messages.find((m) => m.id === 's1')?.sendState).toBe('sent');
  });

  it('marks bubble failed on send error and retry reuses clientMsgId', async () => {
    mockSendRoomMessage.mockRejectedValueOnce(new Error('send_failed'));
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));
    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() =>
      expect(result.current.messages.some((m) => m.sendState === 'failed')).toBe(true),
    );
    const failed = result.current.messages.find((m) => m.sendState === 'failed')!;
    mockSendRoomMessage.mockResolvedValueOnce({
      message: {
        id: 's3',
        room_id: 'r',
        user_id: 'me',
        body: 'hi',
        whisper_to_user_id: null,
        created_at: 't',
      },
      deduped: false,
    });
    await act(async () => {
      await result.current.retry(failed.clientMsgId!);
    });
    expect(mockSendRoomMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientMsgId: failed.clientMsgId }),
    );
  });

  it('loads member_left lifecycle rows as system messages', async () => {
    mockTableRows.room_lifecycle = [
      {
        actor_user_id: 'user-left',
        created_at: '2026-06-07T00:02:00.000Z',
        event: 'member_left',
        id: 'life-1',
      },
    ];
    mockTableRows.profile = [{ nickname: '수아', user_id: 'user-left' }];

    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));

    await waitFor(() =>
      expect(result.current.messages.some((message) => message.kind === 'system')).toBe(true),
    );

    expect(result.current.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: '수아님이 나갔어요',
          id: 'lifecycle-life-1',
          kind: 'system',
          userId: 'user-left',
        }),
      ]),
    );
  });

  it('addSystemMessage merges a realtime leave notice without duplicating the same id', async () => {
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));

    await act(async () => {
      result.current.addSystemMessage({
        id: 'member-left-r-user-a-t1',
        clientMsgId: null,
        userId: 'user-a',
        body: '수아님이 나갔어요',
        whisperToUserId: null,
        createdAt: '2026-06-07T00:03:00.000Z',
      });
      result.current.addSystemMessage({
        id: 'member-left-r-user-a-t1',
        clientMsgId: null,
        userId: 'user-a',
        body: '수아님이 나갔어요',
        whisperToUserId: null,
        createdAt: '2026-06-07T00:03:00.000Z',
      });
    });

    expect(result.current.messages.filter((message) => message.kind === 'system')).toHaveLength(1);
  });
});

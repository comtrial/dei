/**
 * useChatRoom 동작 테스트 (PM 검증서 P0-3 / P0-4 / P2-8).
 *   - 전송 성공 → 낙관적 버블 확정(sent)
 *   - 재시도 가능 실패 → 버블 failed + retryable:true + sendFailure 노출
 *   - 비재시도 BLOCKED → 버블 제거(마커 없음) + sendFailure + ended
 *   - 비재시도 INVALID → 버블 제거(마커 없음) + sendFailure + 방 유지(ended X)
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useChatRoom } from '../useChatRoom';
import { classifySendFailure } from '@/lib/chat/message';

const mockSend = jest.fn();
const mockFetch = jest.fn();
const mockSubscribe = jest.fn();

jest.mock('@/lib/chat/chat-service', () => ({
  fetchMessages: (...a: unknown[]) => mockFetch(...a),
  sendMessage: (...a: unknown[]) => mockSend(...a),
  subscribeConversation: (...a: unknown[]) => mockSubscribe(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([]);
  mockSubscribe.mockReturnValue(() => {});
});

function setup() {
  return renderHook(() => useChatRoom('c1', 'me'));
}

describe('useChatRoom 전송 성공', () => {
  it('성공 → 버블이 sent 로 확정', async () => {
    mockSend.mockResolvedValue({
      ok: true,
      message: {
        id: 'srv-1',
        conversation_id: 'c1',
        sender_user_id: 'me',
        body: '안녕',
        status: 'SENT',
        created_at: '2026-05-16T10:00:00Z',
      },
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('안녕');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].deliveryStatus).toBe('sent');
    expect(result.current.messages[0].id).toBe('srv-1');
    expect(result.current.sendFailure).toBeNull();
  });
});

describe('useChatRoom 재시도 가능 실패 (10-E)', () => {
  it('failed 버블 + retryable:true + sendFailure 노출, ended 아님', async () => {
    mockSend.mockResolvedValue({
      ok: false,
      failure: classifySendFailure({ message: 'transient', retryable: true }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('실패할 메시지');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].deliveryStatus).toBe('failed');
    expect(result.current.messages[0].retryable).toBe(true);
    expect(result.current.sendFailure?.retryable).toBe(true);
    expect(result.current.ended).toBe(false);
  });

  it('retry → 성공 시 버블 sent 확정', async () => {
    mockSend
      .mockResolvedValueOnce({
        ok: false,
        failure: classifySendFailure({ message: 'transient', retryable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        message: {
          id: 'srv-2',
          conversation_id: 'c1',
          sender_user_id: 'me',
          body: '실패할 메시지',
          status: 'SENT',
          created_at: '2026-05-16T10:01:00Z',
        },
      });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('실패할 메시지');
    });
    const clientId = result.current.messages[0].clientId!;

    await act(async () => {
      await result.current.retry(clientId);
    });

    expect(result.current.messages[0].deliveryStatus).toBe('sent');
    expect(result.current.messages[0].id).toBe('srv-2');
  });
});

describe('useChatRoom 비재시도 실패 (P0-4)', () => {
  it('BLOCKED → 버블 제거(마커 없음) + sendFailure + ended', async () => {
    mockSend.mockResolvedValue({
      ok: false,
      failure: classifySendFailure({ reason: 'BLOCKED', retryable: false }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('차단 상대');
    });

    // 비재시도 → 낙관 버블 제거 → retry 마커 노출 자체가 불가.
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.sendFailure?.reason).toBe('BLOCKED');
    expect(result.current.sendFailure?.retryable).toBe(false);
    expect(result.current.sendFailure?.message).toBe('더 이상 대화할 수 없습니다');
    expect(result.current.ended).toBe(true);
  });

  it('INVALID(길이 위반) → 버블 제거 + sendFailure, 방 유지(ended 아님)', async () => {
    mockSend.mockResolvedValue({
      ok: false,
      failure: classifySendFailure({
        message: 'message body must be 1..500 chars',
      }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('너무 긴 메시지');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.sendFailure?.reason).toBe('INVALID');
    // INVALID 가 영구 retry 마커로 잔존하던 버그 회귀 가드 — 마커 대상 버블 없음.
    expect(result.current.ended).toBe(false);
  });

  it('clearSendFailure → 토스트 소비', async () => {
    mockSend.mockResolvedValue({
      ok: false,
      failure: classifySendFailure({ reason: 'BLOCKED', retryable: false }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('차단 상대');
    });
    expect(result.current.sendFailure).not.toBeNull();

    act(() => result.current.clearSendFailure());
    expect(result.current.sendFailure).toBeNull();
  });
});

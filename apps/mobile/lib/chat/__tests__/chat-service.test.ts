/**
 * chat-service 동작 단위 테스트 (PM 검증서 P2-8).
 * Supabase 경계만 모킹해 쿼리 조립 + 결과 매핑 + 전송 분류를 검증한다.
 *   - fetchChatList: DELETED 제외(.neq) + updated_at desc(.order) + 닉네임 매핑
 *   - loadConversationGate: 양방향 차단 RPC 반영
 *   - sendMessage: edge 성공 → message / edge 실패 본문 → classifySendFailure
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.fn();
const neq = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const inFn = vi.fn();
const isFn = vi.fn();
const fromImpl = vi.fn();
const rpcImpl = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => fromImpl(...a),
    rpc: (...a: unknown[]) => rpcImpl(...a),
    functions: { invoke: (...a: unknown[]) => functionsInvoke(...a) },
  },
}));

vi.mock('@dei/shared', () => ({
  logger: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    withErrorCapture: async (_n: string, fn: () => unknown) => fn(),
  },
}));

import {
  fetchChatList,
  loadConversationGate,
  sendMessage,
} from '../chat-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchChatList (CH1)', () => {
  it('DELETED 제외 + updated_at desc 정렬 + 닉네임 매핑', async () => {
    const conversations = {
      select: select.mockReturnThis(),
      neq: neq.mockReturnThis(),
      order: order.mockResolvedValue({
        data: [
          {
            id: 'c1',
            match_id: 'm1',
            user_a_id: 'me',
            user_b_id: 'u2',
            status: 'ACTIVE',
            last_message_preview: '안녕',
            last_message_at: null,
            updated_at: '2026-05-16T09:00:00Z',
          },
        ],
        error: null,
      }),
    };
    const profiles = {
      select: vi.fn().mockReturnThis(),
      in: inFn.mockResolvedValue({
        data: [{ user_id: 'u2', nickname: '하늘' }],
      }),
    };
    fromImpl.mockImplementation((name: string) =>
      name === 'conversations' ? conversations : profiles,
    );

    const list = await fetchChatList('me');

    expect(neq).toHaveBeenCalledWith('status', 'DELETED');
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      conversationId: 'c1',
      otherUserId: 'u2',
      otherNickname: '하늘',
      status: 'ACTIVE',
    });
  });

  it('쿼리 에러 → throw (호출부가 error 상태로 분기 — P1-5)', async () => {
    fromImpl.mockReturnValue({
      select: select.mockReturnThis(),
      neq: neq.mockReturnThis(),
      order: order.mockResolvedValue({ data: null, error: { message: 'boom' } }),
    });
    await expect(fetchChatList('me')).rejects.toThrow('boom');
  });
});

describe('loadConversationGate (CH0)', () => {
  it('양방향 차단 RPC=true → isBlocked true', async () => {
    fromImpl.mockReturnValue({
      select: select.mockReturnThis(),
      eq: eq.mockReturnThis(),
      maybeSingle: maybeSingle.mockResolvedValue({
        data: {
          id: 'c1',
          user_a_id: 'me',
          user_b_id: 'peer',
          status: 'ACTIVE',
        },
      }),
    });
    rpcImpl.mockResolvedValue({ data: true, error: null });

    const gate = await loadConversationGate('c1', 'me');

    expect(rpcImpl).toHaveBeenCalledWith('chat_is_blocked_between', {
      p_user_a: 'me',
      p_user_b: 'peer',
    });
    expect(gate.isBlocked).toBe(true);
    expect(gate.conversation).toEqual({ status: 'ACTIVE', otherUserId: 'peer' });
  });

  it('conversation 미존재 → conversation null, 차단 RPC 미호출', async () => {
    fromImpl.mockReturnValue({
      select: select.mockReturnThis(),
      eq: eq.mockReturnThis(),
      maybeSingle: maybeSingle.mockResolvedValue({ data: null }),
    });

    const gate = await loadConversationGate('cX', 'me');

    expect(gate.conversation).toBeNull();
    expect(gate.isBlocked).toBe(false);
    expect(rpcImpl).not.toHaveBeenCalled();
  });
});

describe('sendMessage (CH-API1 / B-CH2)', () => {
  it('edge 200 + message → ok 확정 버블 소스', async () => {
    functionsInvoke.mockResolvedValue({
      data: {
        message: {
          id: 'srv-1',
          conversation_id: 'c1',
          sender_user_id: 'me',
          body: '안녕',
          status: 'SENT',
          created_at: '2026-05-16T10:00:00Z',
        },
      },
      error: null,
    });

    const r = await sendMessage('c1', '안녕');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message.id).toBe('srv-1');
  });

  it('edge 4xx 본문(reason=BLOCKED, retryable=false) → 비재시도 분류', async () => {
    functionsInvoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => ({
            error: 'blocked',
            reason: 'BLOCKED',
            retryable: false,
          }),
        },
      },
    });

    const r = await sendMessage('c1', '안녕');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.reason).toBe('BLOCKED');
      expect(r.failure.retryable).toBe(false);
      expect(r.failure.message).toBe('더 이상 대화할 수 없습니다');
    }
  });

  it('edge/RPC 모두 실패 → NETWORK 재시도 분류 (인라인 retry)', async () => {
    functionsInvoke.mockResolvedValue({ data: null, error: null });
    rpcImpl.mockResolvedValue({ data: null, error: { message: 'network down' } });

    const r = await sendMessage('c1', '안녕');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.reason).toBe('NETWORK');
      expect(r.failure.retryable).toBe(true);
    }
  });
});

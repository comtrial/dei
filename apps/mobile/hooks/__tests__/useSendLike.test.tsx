import { act, renderHook } from '@testing-library/react-native';

import { analytics, logger } from '@dei/shared';

import { useSendLike } from '../useSendLike';

const mockInvoke = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

let captureSpy: jest.SpyInstance;
let loggerSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);
  loggerSpy = jest.spyOn(logger, 'captureException').mockImplementation(() => undefined);
});

afterEach(() => {
  captureSpy.mockRestore();
  loggerSpy.mockRestore();
});

describe('useSendLike analytics', () => {
  it('captures like_send_persisted right after send-like Edge Function returns 200 (no error)', async () => {
    mockInvoke.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useSendLike());
    let res;
    await act(async () => {
      res = await result.current.send({
        toUserId: 'peer-1',
        attachedLogId: 'log-9',
        usedGrant: true,
      });
    });

    expect(res).toEqual({ kind: 'ok' });
    expect(mockInvoke).toHaveBeenCalledWith('send-like', {
      body: {
        attachedLogId: 'log-9',
        toUserId: 'peer-1',
      },
    });
    expect(mockRpc).not.toHaveBeenCalled();

    // like_sent fires at submit with attached log + grant flag.
    expect(captureSpy).toHaveBeenCalledWith('like_sent', {
      peer_user_id: 'peer-1',
      attached_log_id: 'log-9',
      used_grant: true,
    });

    // like_send_persisted fires only after the server call resolves without error.
    expect(captureSpy).toHaveBeenCalledWith('like_send_persisted', {
      peer_user_id: 'peer-1',
    });

    // persisted is captured after submit, in order.
    const order = captureSpy.mock.calls.map((c) => c[0]);
    expect(order.indexOf('like_send_persisted')).toBeGreaterThan(order.indexOf('like_sent'));
  });

  it('falls back to RPC and does NOT capture like_send_persisted when both paths fail', async () => {
    mockInvoke.mockResolvedValueOnce({ error: { message: 'edge unavailable' } });
    mockRpc.mockResolvedValueOnce({ error: { message: 'daily_quota_exceeded' } });

    const { result } = renderHook(() => useSendLike());
    let res;
    await act(async () => {
      res = await result.current.send({ toUserId: 'peer-2', attachedLogId: null });
    });

    expect(res).toEqual({ kind: 'error', reason: 'daily_quota_exceeded' });
    expect(mockRpc).toHaveBeenCalledWith('send_like', {
      p_attached_log_id: undefined,
      p_to_user_id: 'peer-2',
    });

    const events = captureSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('like_sent');
    expect(events).not.toContain('like_send_persisted');
  });
});

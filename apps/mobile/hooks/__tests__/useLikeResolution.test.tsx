import { act, renderHook } from '@testing-library/react-native';

import { analytics, logger } from '@dei/shared';

import { useLikeResolution } from '../useLikeResolution';

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

describe('useLikeResolution analytics', () => {
  it('captures like_accepted and match_created_in_db after accept-like Edge Function returns 200', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { conversationId: 'conv-1', matchId: 'match-1', counterpartId: 'peer-1' },
      error: null,
    });

    const likedAt = new Date(Date.now() - 60_000).toISOString();
    const { result } = renderHook(() => useLikeResolution('like-1', likedAt));
    let res;
    await act(async () => {
      res = await result.current.accept();
    });

    expect(res).toEqual({
      kind: 'accepted',
      conversationId: 'conv-1',
      matchId: 'match-1',
      counterpartId: 'peer-1',
    });
    expect(mockRpc).not.toHaveBeenCalled();

    expect(captureSpy).toHaveBeenCalledWith('like_accepted', {
      peer_user_id: 'peer-1',
      since_received_sec: expect.any(Number),
    });
    // ~60s elapsed since likedAt.
    const acceptedCall = captureSpy.mock.calls.find((c) => c[0] === 'like_accepted');
    expect((acceptedCall?.[1] as { since_received_sec: number }).since_received_sec).toBeGreaterThanOrEqual(59);

    expect(captureSpy).toHaveBeenCalledWith('match_created_in_db', {
      peer_user_id: 'peer-1',
      source: 'accept',
    });
  });

  it('captures neither event when both Edge Function and accept_like RPC return an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'edge unavailable' } });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'like_expired' } });

    const { result } = renderHook(() => useLikeResolution('like-2'));
    let res;
    await act(async () => {
      res = await result.current.accept();
    });

    expect(res).toEqual({ kind: 'error', reason: 'expired' });

    const events = captureSpy.mock.calls.map((c) => c[0]);
    expect(events).not.toContain('like_accepted');
    expect(events).not.toContain('match_created_in_db');
  });

  it('omits since_received_sec when likedAt is not provided', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { conversationId: null, matchId: 'match-3', counterpartId: 'peer-3' },
      error: null,
    });

    const { result } = renderHook(() => useLikeResolution('like-3'));
    await act(async () => {
      await result.current.accept();
    });

    const acceptedCall = captureSpy.mock.calls.find((c) => c[0] === 'like_accepted');
    expect(acceptedCall?.[1]).toEqual({
      peer_user_id: 'peer-3',
      since_received_sec: undefined,
    });
  });
});

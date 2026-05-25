import { act, renderHook } from '@testing-library/react-native';

import { analytics } from '@dei/shared';

import { useLikeResolution } from '../useLikeResolution';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

let captureSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);
});

afterEach(() => {
  captureSpy.mockRestore();
});

describe('useLikeResolution analytics', () => {
  it('captures like_accepted and match_created_in_db after accept_like RPC returns 200', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { match_id: 'match-1', counterpart_id: 'peer-1' },
      error: null,
    });

    const likedAt = new Date(Date.now() - 60_000).toISOString();
    const { result } = renderHook(() => useLikeResolution('like-1', likedAt));
    let res;
    await act(async () => {
      res = await result.current.accept();
    });

    expect(res).toEqual({ kind: 'accepted', matchId: 'match-1', counterpartId: 'peer-1' });

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

  it('captures neither event when accept_like RPC returns an error', async () => {
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
    mockRpc.mockResolvedValueOnce({
      data: { match_id: 'match-3', counterpart_id: 'peer-3' },
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

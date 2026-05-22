import { renderHook, waitFor } from '@testing-library/react-native';

import { useLike } from '../useLike';

const mockFrom = jest.fn();
const mockSend = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void) => {
      React.useEffect(callback, [callback]);
    },
  };
});

jest.mock('@/hooks/useSendLike', () => ({
  useSendLike: () => ({ send: mockSend }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function makeLikesQuery(result: { data: unknown[] | null; error: Error | null }) {
  type LikesQuery = {
    eq: jest.Mock<LikesQuery, [string, unknown]>;
    gte: jest.Mock<LikesQuery, [string, unknown]>;
    in: jest.Mock<Promise<typeof result>, [string, unknown[]]>;
    lt: jest.Mock<Promise<typeof result>, [string, unknown]>;
    select: jest.Mock<LikesQuery, [string]>;
  };

  const query = {} as LikesQuery;
  query.eq = jest.fn((_column: string, _value: unknown) => query);
  query.gte = jest.fn((_column: string, _value: unknown) => query);
  query.in = jest.fn((_column: string, _values: unknown[]) => Promise.resolve(result));
  query.lt = jest.fn((_column: string, _value: unknown) => Promise.resolve(result));
  query.select = jest.fn((_columns: string) => query);
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useLike', () => {
  it('marks previously sent active likes as liked even when they were not sent today', async () => {
    const todayLikesQuery = makeLikesQuery({
      data: [{ id: 'today-like' }],
      error: null,
    });
    const sentLikesQuery = makeLikesQuery({
      data: [
        {
          expires_at: '2099-01-01T00:00:00.000Z',
          status: 'pending',
          to_user_id: 'older-pending-user',
        },
        {
          expires_at: '2000-01-01T00:00:00.000Z',
          status: 'accepted',
          to_user_id: 'accepted-user',
        },
        {
          expires_at: '2000-01-01T00:00:00.000Z',
          status: 'pending',
          to_user_id: 'expired-pending-user',
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(todayLikesQuery).mockReturnValueOnce(sentLikesQuery);

    const { result } = renderHook(() => useLike('me'));

    await waitFor(() => {
      expect(result.current.hasLikedUser('older-pending-user')).toBe(true);
    });

    expect(result.current.hasLikedUser('accepted-user')).toBe(true);
    expect(result.current.hasLikedUser('expired-pending-user')).toBe(false);
    expect(result.current.remainingLikes).toBe(0);
    expect(todayLikesQuery.gte).toHaveBeenCalledWith('liked_at', expect.any(String));
    expect(todayLikesQuery.lt).toHaveBeenCalledWith('liked_at', expect.any(String));
    expect(sentLikesQuery.in).toHaveBeenCalledWith('status', ['pending', 'accepted']);
  });
});

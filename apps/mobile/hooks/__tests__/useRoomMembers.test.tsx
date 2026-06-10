import { act, renderHook, waitFor } from '@testing-library/react-native';

type MemberHandler = (row: Record<string, unknown>) => void;

const mockFrom = jest.fn();
let memberHandler: MemberHandler | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/realtime', () => ({
  subscribeRoomMembers: jest.fn((_roomId: string, onUpdate: MemberHandler) => {
    memberHandler = onUpdate;
    return jest.fn();
  }),
}));

jest.mock('@dei/shared', () => ({
  logger: {
    captureException: jest.fn(),
  },
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import { useRoomMembers } from '../useRoomMembers';

function member(userId: string, status: 'active' | 'left' | 'auto_kicked' = 'active') {
  return {
    joined_at: '2026-06-07T00:00:00.000Z',
    left_at: status === 'active' ? null : '2026-06-07T00:01:00.000Z',
    role: 'member',
    room_id: 'room-1',
    status,
    user_id: userId,
  };
}

function mockActiveMembersFetch(rows: ReturnType<typeof member>[]) {
  mockFrom.mockImplementation(() => {
    let eqCount = 0;
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => {
        eqCount += 1;
        return eqCount >= 2 ? Promise.resolve({ data: rows, error: null }) : query;
      }),
    };
    return query;
  });
}

describe('useRoomMembers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memberHandler = null;
  });

  it('removes a member from the active list and fires onMemberLeft on left realtime update', async () => {
    const onMemberLeft = jest.fn();
    mockActiveMembersFetch([member('user-a'), member('user-b')]);

    const { result } = renderHook(() =>
      useRoomMembers('room-1', { onMemberLeft }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      memberHandler?.(member('user-a', 'left'));
    });

    expect(onMemberLeft).toHaveBeenCalledWith('user-a', 'left');
    expect(result.current.members.map((row) => row.user_id)).toEqual(['user-b']);
  });

  it('keeps active realtime updates in the active list', async () => {
    mockActiveMembersFetch([member('user-a')]);

    const { result } = renderHook(() => useRoomMembers('room-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      memberHandler?.(member('user-b'));
    });

    expect(result.current.members.map((row) => row.user_id)).toEqual(['user-a', 'user-b']);
  });
});

import { renderHook, act } from '@testing-library/react-native';

import { useRoomPresence } from '../useRoomPresence';

type SyncHandler = (state: Record<string, Array<{ user_id: string }>>) => void;

let capturedSyncHandler: SyncHandler | null = null;
let capturedUnsubscribe: (() => void) | null = null;

jest.mock('@/lib/realtime', () => ({
  subscribeRoomPresence: jest.fn(
    (_roomId: string, _selfUserId: string, onSync: SyncHandler) => {
      capturedSyncHandler = onSync;
      const unsub = jest.fn(() => {
        capturedSyncHandler = null;
      });
      capturedUnsubscribe = unsub;
      return unsub;
    },
  ),
}));

describe('useRoomPresence', () => {
  beforeEach(() => {
    capturedSyncHandler = null;
    capturedUnsubscribe = null;
  });

  it('초기 onlineUserIds 는 빈 Set', () => {
    const { result } = renderHook(() =>
      useRoomPresence('room-1', { selfUserId: 'user-a' }),
    );
    expect(result.current.onlineUserIds.size).toBe(0);
  });

  it('sync 이벤트 수신 시 onlineUserIds 갱신', () => {
    const { result } = renderHook(() =>
      useRoomPresence('room-1', { selfUserId: 'user-a' }),
    );

    act(() => {
      capturedSyncHandler?.({
        'user-a': [{ user_id: 'user-a' }],
        'user-b': [{ user_id: 'user-b' }],
      });
    });

    expect(result.current.onlineUserIds.has('user-a')).toBe(true);
    expect(result.current.onlineUserIds.has('user-b')).toBe(true);
    expect(result.current.onlineUserIds.size).toBe(2);
  });

  it('iAmOnline: selfUserId 가 onlineUserIds 에 있으면 true', () => {
    const { result } = renderHook(() =>
      useRoomPresence('room-1', { selfUserId: 'user-a' }),
    );

    act(() => {
      capturedSyncHandler?.({ 'user-a': [{ user_id: 'user-a' }] });
    });

    expect(result.current.iAmOnline).toBe(true);
  });

  it('iAmOnline: selfUserId 없으면 false', () => {
    const { result } = renderHook(() => useRoomPresence('room-1'));
    expect(result.current.iAmOnline).toBe(false);
  });

  it('selfUserId null 이면 subscribeRoomPresence 호출 안 함', () => {
    const { subscribeRoomPresence } = require('@/lib/realtime') as {
      subscribeRoomPresence: jest.Mock;
    };
    subscribeRoomPresence.mockClear();

    renderHook(() => useRoomPresence('room-1', { selfUserId: null }));
    expect(subscribeRoomPresence).not.toHaveBeenCalled();
  });

  it('unmount 시 unsubscribe 호출', () => {
    const { unmount } = renderHook(() =>
      useRoomPresence('room-1', { selfUserId: 'user-a' }),
    );
    const unsub = capturedUnsubscribe;
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('useIsUserOnline: 집합에 있는 userId true 반환', () => {
    const { result } = renderHook(() =>
      useRoomPresence('room-1', { selfUserId: 'user-a' }),
    );

    act(() => {
      capturedSyncHandler?.({ 'user-b': [{ user_id: 'user-b' }] });
    });

    expect(result.current.useIsUserOnline('user-b')).toBe(true);
    expect(result.current.useIsUserOnline('user-c')).toBe(false);
  });
});

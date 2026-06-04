import { renderHook, act } from '@testing-library/react-native';

import type { Database } from '@dei/api';

import { useRoomEndedDetector } from '../useRoomEndedDetector';

type RoomMemberRow = Database['public']['Tables']['room_member']['Row'];

jest.mock('@dei/shared', () => ({
  POLICY: {
    room: { roomEndedGraceMs: 5000 },
    gridPerformance: { realtimeDebounceMs: 100 },
  },
  analytics: { capture: jest.fn() },
  logger: { captureException: jest.fn(), captureMessage: jest.fn() },
}));

jest.mock('@/lib/analytics-taxonomy', () => ({
  ANALYTICS_EVENTS: {
    room_closed_last_member_left: 'S5:room_closed_last_member_left',
  },
}));

function makeRow(userId: string, status: string): RoomMemberRow {
  return {
    id: userId,
    room_id: 'room-1',
    user_id: userId,
    status,
    joined_at: new Date().toISOString(),
    left_at: null,
    kicked_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as RoomMemberRow;
}

describe('useRoomEndedDetector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const { analytics } = require('@dei/shared') as { analytics: { capture: jest.Mock } };
    analytics.capture.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('active 멤버 있으면 onRoomEnded 호출 안 함', () => {
    const onRoomEnded = jest.fn();
    const members = [makeRow('user-a', 'active'), makeRow('user-b', 'active')];

    renderHook(() =>
      useRoomEndedDetector('room-1', members, { selfUserId: 'user-a', onRoomEnded }),
    );

    act(() => { jest.advanceTimersByTime(6000); });
    expect(onRoomEnded).not.toHaveBeenCalled();
  });

  it('본인 active → left 전환 시 grace(5s) 후 onRoomEnded 1회 발화', () => {
    const onRoomEnded = jest.fn();
    const activeMembers = [makeRow('user-a', 'active')];
    const leftMembers = [makeRow('user-a', 'left')];

    const { rerender } = renderHook(
      ({ members }: { members: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', members, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { members: activeMembers } },
    );
    // 본인을 active 로 먼저 확인 → 그 후 본인이 left 로 사라짐.
    rerender({ members: leftMembers });

    act(() => { jest.advanceTimersByTime(4999); });
    expect(onRoomEnded).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1); });
    expect(onRoomEnded).toHaveBeenCalledTimes(1);
  });

  // 회귀(이번 버그): 본인이 active 인데 members 가 *일시적으로 빈 배열*(refetch/
  // 포그라운드 복귀 윈도우)이어도 ended 로 오판해 홈으로 빠지면 안 된다.
  it('본인 active 본 뒤 members 일시 빈 배열 → onRoomEnded 미발화(오판 방지)', () => {
    const onRoomEnded = jest.fn();
    const activeMembers = [makeRow('user-a', 'active')];

    const { rerender } = renderHook(
      ({ members }: { members: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', members, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { members: activeMembers } },
    );
    // refetch 중 일시적으로 빈 배열 → 5s 경과 → 다시 본인 active 복귀.
    rerender({ members: [] });
    act(() => { jest.advanceTimersByTime(3000); });
    rerender({ members: activeMembers });
    act(() => { jest.advanceTimersByTime(5000); });
    expect(onRoomEnded).not.toHaveBeenCalled();
  });

  // 초기 로딩(본인을 active 로 보기 전 빈/left)에는 절대 발화하지 않는다.
  it('본인을 active 로 보기 전(초기 빈/left)에는 onRoomEnded 미발화', () => {
    const onRoomEnded = jest.fn();
    renderHook(() =>
      useRoomEndedDetector('room-1', [], { selfUserId: 'user-a', onRoomEnded }),
    );
    act(() => { jest.advanceTimersByTime(6000); });
    expect(onRoomEnded).not.toHaveBeenCalled();
  });

  it('grace 도중 active 복귀 시 타이머 취소 → onRoomEnded 미발화', () => {
    const onRoomEnded = jest.fn();
    const emptyMembers = [makeRow('user-a', 'left')];
    const activeMembers = [makeRow('user-a', 'active')];

    const { rerender } = renderHook(
      ({ members }: { members: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', members, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { members: emptyMembers } },
    );

    act(() => { jest.advanceTimersByTime(3000); });

    rerender({ members: activeMembers });

    act(() => { jest.advanceTimersByTime(3000); });
    expect(onRoomEnded).not.toHaveBeenCalled();
  });

  it('onRoomEnded 중복 발화 방지 (1회 lock)', () => {
    const onRoomEnded = jest.fn();

    const { rerender } = renderHook(
      ({ m }: { m: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', m, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { m: [makeRow('user-a', 'active')] } },
    );
    rerender({ m: [makeRow('user-a', 'left')] });

    act(() => { jest.advanceTimersByTime(5000); });
    expect(onRoomEnded).toHaveBeenCalledTimes(1);

    rerender({ m: [makeRow('user-a', 'left'), makeRow('user-b', 'left')] });
    act(() => { jest.advanceTimersByTime(5000); });
    expect(onRoomEnded).toHaveBeenCalledTimes(1);
  });

  it('onRoomEnded 발화 시 analytics room_closed_last_member_left 이벤트 발화', () => {
    const onRoomEnded = jest.fn();
    const { analytics } = require('@dei/shared') as { analytics: { capture: jest.Mock } };

    const { rerender } = renderHook(
      ({ m }: { m: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', m, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { m: [makeRow('user-a', 'active')] } },
    );
    rerender({ m: [makeRow('user-a', 'left')] });

    act(() => { jest.advanceTimersByTime(5000); });

    expect(analytics.capture).toHaveBeenCalledWith(
      'S5:room_closed_last_member_left',
      expect.objectContaining({ room_id: 'room-1', self_user_id: 'user-a' }),
    );
  });

  it('unmount 시 grace 타이머 정리 → onRoomEnded 미발화', () => {
    const onRoomEnded = jest.fn();

    const { rerender, unmount } = renderHook(
      ({ m }: { m: RoomMemberRow[] }) =>
        useRoomEndedDetector('room-1', m, { selfUserId: 'user-a', onRoomEnded }),
      { initialProps: { m: [makeRow('user-a', 'active')] } },
    );
    rerender({ m: [makeRow('user-a', 'left')] });

    act(() => { jest.advanceTimersByTime(3000); });
    unmount();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(onRoomEnded).not.toHaveBeenCalled();
  });
});

import { render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
const mockAppStateAddEventListener = jest.fn();
let mockFallbackIntervalCallback: (() => void | Promise<void>) | null = null;
let mockSearchParams: Record<string, string | undefined> = {};
let mockRoomMemberResponses: ({ room_id: string } | null)[] = [{ room_id: 'room-xyz' }];

// expo-router: useFocusEffect 는 콜백을 실행하지 않는 noop(=BackHandler 미호출).
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: jest.fn(),
}));

// 화면 뷰는 SUT 동작과 무관 — 의존 트리(아이콘 등)를 끊기 위해 스텁.
jest.mock('@/components/matching/MatchingWaitingView', () => ({
  MatchingWaitingView: () => null,
}));

jest.mock('@/lib/matching', () => ({
  expireMatchQueue: jest.fn(() => Promise.resolve()),
  isQueueExpired: jest.fn(() => false),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

// logger.withErrorCapture 는 래핑한 async fn 을 실제로 실행해야 race-check 가 돈다.
jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
  toMatchQueueMode: (value: unknown) => (value === 'college' ? 'college' : 'normal'),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import QueueScreen from '../queue';

function makeChain(rows: { data: unknown; error?: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: rows.data, error: rows.error ?? null }),
  };
}

function makePendingChain() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(() => new Promise(() => {})),
  };
}

function makeListChain(rows: { data: unknown; error?: unknown }) {
  // team_member 조회는 maybeSingle 없이 awaited thenable 로 끝난다.
  const result = { data: rows.data, error: rows.error ?? null };
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(() => Promise.resolve(result)),
  };
  return chain;
}

describe('QueueScreen — room_matched 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockRoomMemberResponses = [{ room_id: 'room-xyz' }];
    mockFallbackIntervalCallback = null;
    mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((...args) =>
      mockAppStateAddEventListener(...args) as ReturnType<typeof AppState.addEventListener>
    );

    // realtime 구독 빌더: .on().subscribe() 체인이 깨지지 않게.
    mockChannel.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'team_member') {
        // 큐 로드 effect: 팀 1개 → match_queue 조회로 진행(홈 리다이렉트 회피).
        return makeListChain({ data: [{ team_id: 'team-1' }] });
      }

      if (table === 'match_queue') {
        return makePendingChain();
      }

      if (table === 'room_member') {
        // 진입 직전 이미 매칭됨 → routeToRoom 즉시 발동.
        return makeChain({ data: mockRoomMemberResponses.shift() ?? null });
      }

      return makeChain({ data: null });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('진입 직전 매칭(room_member race-check) 감지 시 room_matched capture + 방으로 replace', async () => {
    render(<QueueScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F1:room_matched', {
        room_id: 'room-xyz',
      });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/room/room-xyz');
    });
  });

  it('entrypoint 파라미터가 있으면 room_matched 에 함께 붙인다', async () => {
    mockSearchParams = { entrypoint: 'college', mode: 'college' };

    render(<QueueScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F1:room_matched', {
        entry_point: 'college',
        mode: 'college',
        room_id: 'room-xyz',
      });
    });
  });

  it('room_member realtime 을 놓쳐도 fallback 재조회에서 active room 감지 시 방으로 replace', async () => {
    mockRoomMemberResponses = [null, { room_id: 'room-late' }];
    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    jest.spyOn(global, 'setInterval').mockImplementation((callback, timeout, ...args) => {
      if (timeout === 3000) {
        mockFallbackIntervalCallback = () => {
          if (typeof callback === 'function') {
            return callback(...args);
          }
        };
        return 1 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(callback, timeout, ...args);
    });
    jest.spyOn(global, 'clearInterval').mockImplementation((intervalId) => {
      if (intervalId === (1 as unknown as ReturnType<typeof setInterval>)) {
        return;
      }
      return realClearInterval(intervalId);
    });

    render(<QueueScreen />);
    await waitFor(() => {
      expect(mockFallbackIntervalCallback).not.toBeNull();
    });

    void mockFallbackIntervalCallback?.();

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F1:room_matched', {
        room_id: 'room-late',
      });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/room/room-late');
    });
  });
});

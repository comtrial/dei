import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();

// expo-router: useFocusEffect 는 콜백을 실행하지 않는 noop(=BackHandler 미호출).
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
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
        return makeChain({
          data: {
            desired_size: 4,
            enqueued_at: '2026-06-07T00:00:00.000Z',
            expires_at: '2026-06-07T06:00:00.000Z',
            id: 'queue-1',
          },
        });
      }

      if (table === 'room_member') {
        // 진입 직전 이미 매칭됨 → routeToRoom 즉시 발동.
        return makeChain({ data: { room_id: 'room-xyz' } });
      }

      return makeChain({ data: null });
    });
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
});

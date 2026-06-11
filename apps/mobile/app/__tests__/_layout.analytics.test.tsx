import { render, waitFor } from '@testing-library/react-native';

const mockAnalyticsCapture = jest.fn();
const mockAnalyticsRegister = jest.fn();
const mockGetSession = jest.fn();

// 관측 init 은 부수효과만 — no-op 으로 차단(실제 Sentry/PostHog 미접촉).
jest.mock('@/lib/posthog', () => ({ initPostHog: jest.fn() }));
jest.mock('@/lib/purchases', () => ({ initPurchases: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ initSentry: jest.fn() }));
jest.mock('@/lib/notifications.stub', () => ({ configureForegroundNotifications: jest.fn() }));

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

jest.mock('@dei/shared', () => ({
  analytics: {
    capture: (...args: unknown[]) => mockAnalyticsCapture(...args),
    register: (...args: unknown[]) => mockAnalyticsRegister(...args),
  },
}));

// 무거운 자식 트리(프로바이더·Stack·제스처)는 렌더 부담을 줄이려 stub.
// 이 테스트의 관심사는 루트 useEffect 의 app_opened capture 동작뿐이다.
jest.mock('expo-router', () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('@/providers/auth-provider', () => ({
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('@/providers/root-gate', () => ({
  RootGate: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('nativewind', () => ({ cssInterop: jest.fn() }));
jest.mock('expo-video', () => ({ VideoView: 'VideoView' }));
jest.mock('../../global.css', () => ({}), { virtual: true });

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import RootLayout from '../_layout';

describe('RootLayout — app_opened (Activation 퍼널 분모)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('세션 있음 → app_opened { has_token: true, source: cold_start }', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F0:app_opened', {
        has_token: true,
        source: 'cold_start',
      });
    });
  });

  it('앱 시작 시 모든 이벤트에 붙을 공통 analytics props 를 등록한다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockAnalyticsRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics_schema_version: 1,
          app_env: expect.any(String),
          build_channel: expect.any(String),
          is_qa: expect.any(Boolean),
          platform: expect.any(String),
        }),
      );
    });
  });

  it('세션 없음 → app_opened { has_token: false }', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F0:app_opened', {
        has_token: false,
        source: 'cold_start',
      });
    });
  });
});

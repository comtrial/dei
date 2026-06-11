import { render, waitFor } from '@testing-library/react-native';

const mockAnalyticsIdentify = jest.fn();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();

jest.mock('@dei/shared', () => ({
  analytics: {
    identify: (...args: unknown[]) => mockAnalyticsIdentify(...args),
    reset: jest.fn(),
  },
  logger: {
    captureException: jest.fn(),
    setUser: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('@/lib/purchases', () => ({
  resetPurchasesUser: jest.fn(() => Promise.resolve()),
  syncPurchasesUser: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/profile-session-cache', () => ({
  clearCachedProfileSnapshot: jest.fn(),
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import { AuthProvider } from '../auth-provider';

describe('AuthProvider — analytics identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
  });

  it('restored sessions identify the current user for PostHog cohorts', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
            is_anonymous: false,
          },
        },
      },
      error: null,
    });

    render(
      <AuthProvider>
        <></>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockAnalyticsIdentify).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          auth_state: 'authenticated',
        }),
      );
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

const mockAnalyticsIdentify = jest.fn();
const mockAnalyticsReset = jest.fn();
const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@dei/shared', () => ({
  analytics: {
    identify: (...args: unknown[]) => mockAnalyticsIdentify(...args),
    reset: (...args: unknown[]) => mockAnalyticsReset(...args),
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
      getUser: (...args: unknown[]) => mockGetUser(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInAnonymously: jest.fn(),
      signOut: (...args: unknown[]) => mockSignOut(...args),
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
import { AuthProvider, useAuth } from '../auth-provider';

function AuthProbe() {
  const { signOut, user } = useAuth();

  return (
    <>
      <Text testID="auth-user">{user?.id ?? 'no-user'}</Text>
      <Pressable
        testID="auth-sign-out"
        onPress={() => {
          void signOut().catch(() => undefined);
        }}
      >
        <Text>sign out</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider — analytics identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', is_anonymous: false } },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
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

  it('clears a restored local session when the auth user no longer exists', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'withdrawn-user',
            is_anonymous: false,
          },
        },
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('User not found'),
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user').props.children).toBe('no-user');
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('clears local state even when remote sign-out fails after account deletion', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'withdrawn-user',
            is_anonymous: false,
          },
        },
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'withdrawn-user', is_anonymous: false } },
      error: null,
    });
    mockSignOut
      .mockResolvedValueOnce({ error: new Error('User from sub claim in JWT does not exist') })
      .mockResolvedValueOnce({ error: null });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user').props.children).toBe('withdrawn-user');
    });

    fireEvent.press(screen.getByTestId('auth-sign-out'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-user').props.children).toBe('no-user');
    });
    expect(mockAnalyticsReset).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

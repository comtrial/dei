import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockStack = jest.fn(({ children }: { children?: unknown }) => children ?? null);
const mockStackScreen = jest.fn(() => null);
const mockSupabaseFrom = jest.fn();
const mockWithErrorCapture = jest.fn((_name: string, fn: () => Promise<unknown>) => fn());
let mockAuthState: { isLoading: boolean; user: { id: string } | null } = {
  isLoading: false,
  user: { id: 'user-1' },
};

jest.mock('expo-router', () => {
  const Stack = (...args: unknown[]) => mockStack(...args);
  Stack.Screen = (...args: unknown[]) => mockStackScreen(...args);

  return {
    Stack,
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('@dei/shared', () => ({
  logger: {
    withErrorCapture: (...args: Parameters<typeof mockWithErrorCapture>) =>
      mockWithErrorCapture(...args),
  },
}));

jest.mock('@dei/ui', () => {
  return {
    Spinner: () => null,
  };
});

jest.mock('@/lib/b-flow', () => ({
  TERMS_VERSION: '2026-05-30',
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import AppLayout from '../_layout';

function makeMaybeSingleChain(data: unknown, error: unknown = null) {
  return {
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    order: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  };
}

function mockGateRows({
  profile = {
    birth_year: 2001,
    gender: 'female',
    is_adult: true,
    nickname: '하루산책',
    onboarding_completed_at: '2026-05-30T00:00:00.000Z',
    photo_url: 'user/profile.jpg',
    region: 'seoul',
  },
  termsAgreement = { id: 'terms-1' },
  verifiedIdentity = { provider_metadata: null, verified_at: '2026-05-30T00:00:00.000Z' },
}: {
  profile?: unknown;
  termsAgreement?: unknown;
  verifiedIdentity?: unknown;
} = {}) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'profile') {
      return makeMaybeSingleChain(profile);
    }

    if (table === 'auth_verification') {
      return makeMaybeSingleChain(verifiedIdentity);
    }

    if (table === 'terms_agreement') {
      return makeMaybeSingleChain(termsAgreement);
    }

    return makeMaybeSingleChain(null);
  });
}

describe('AppLayout auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStack.mockClear();
    mockStackScreen.mockClear();
    mockAuthState = { isLoading: false, user: { id: 'user-1' } };
    mockGateRows();
  });

  it('does not render app screens until the gate passes', () => {
    mockAuthState = { isLoading: true, user: null };

    render(<AppLayout />);

    expect(mockStack).not.toHaveBeenCalled();
  });

  it('redirects missing users to terms without rendering app screens', async () => {
    mockAuthState = { isLoading: false, user: null };

    render(<AppLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/terms');
    });
    expect(mockStack).not.toHaveBeenCalled();
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('redirects users without a verified auth_verification row to terms', async () => {
    mockGateRows({ verifiedIdentity: null });

    render(<AppLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/terms');
    });
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('redirects users without current terms to terms', async () => {
    mockGateRows({ termsAgreement: null });

    render(<AppLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/terms');
    });
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('renders app screens after identity, terms, and onboarding gates pass', async () => {
    render(<AppLayout />);

    await waitFor(() => {
      expect(mockStack).toHaveBeenCalled();
    });
    expect(mockStackScreen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'room/[roomId]/chat' }),
      undefined,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

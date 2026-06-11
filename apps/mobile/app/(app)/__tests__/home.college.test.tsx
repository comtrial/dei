import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSupabaseFrom = jest.fn();

let mockProfile: Record<string, unknown> | null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/profile-session-cache', () => ({
  getCachedProfileSnapshot: jest.fn(() => null),
  mergeCachedProfileSnapshot: jest.fn(),
}));

jest.mock('@/lib/auth-flow', () => ({
  getAuthGateRoute: jest.fn(() => null),
}));

jest.mock('@/lib/identity-profile', () => ({
  VERIFIED_IDENTITY_SELECT: 'verified',
  repairProfileIdentityFromVerification: jest.fn(({ profile }) => Promise.resolve(profile)),
}));

jest.mock('@/lib/notifications.stub', () => ({
  needsNotificationConsent: jest.fn(() => Promise.resolve(false)),
  registerPushToken: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/matching', () => ({
  enqueueMatchQueue: jest.fn(() =>
    Promise.resolve({
      enqueuedAt: '2026-06-11T00:00:00.000Z',
      expiresAt: null,
      memberCount: 1,
      queueId: 'queue-1',
      reused: false,
      teamId: 'team-1',
    }),
  ),
  isMatchQueueError: jest.fn(() => false),
  isMatchQueueErrorCode: jest.fn(() => false),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  collegeProfileCompleted: ({
    isStudent,
    universityName,
  }: {
    isStudent?: boolean | null;
    universityName?: string | null;
  }) => Boolean(isStudent && universityName?.trim()),
  formatRematchCountdown: jest.fn(() => '00:00'),
  getRematchRestriction: jest.fn(() => ({ remainingMs: 0, restricted: false })),
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
  POLICY: {
    payment: { femaleInstantRematchFree: true },
    team: { maxMembers: 5 },
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    },
  },
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    AlertDialog: () => null,
    Avatar: () => null,
    Banner: ({
      children,
      title,
    }: {
      children?: React.ReactNode;
      title?: React.ReactNode;
    }) =>
      React.createElement(
        RN.View,
        null,
        title ? React.createElement(RN.Text, null, title) : null,
        children ? React.createElement(RN.Text, null, children) : null,
      ),
    Card: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    color: {
      accent: 'red',
      info: 'blue',
      'ink-4': 'gray',
    },
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, props, children),
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import HomeScreen from '../home';

function makeProfileChain() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: mockProfile, error: null })),
      })),
    })),
  };
}

function makeVerificationChain() {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return chain;
}

function makePassChain() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  };
}

describe('HomeScreen — college gwating entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = {
      birth_year: 2001,
      gender: 'female',
      is_adult: true,
      is_student: true,
      last_room_leave_at: null,
      nickname: '수아',
      onboarding_completed_at: '2026-06-11T00:00:00.000Z',
      photo_url: null,
      region: '서울',
      university_name: '한국대학교',
    };
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profile') return makeProfileChain();
      if (table === 'auth_verification') return makeVerificationChain();
      if (table === 'pass') return makePassChain();
      return {};
    });
  });

  it('keeps existing entries and adds a college entry only for completed student profiles', async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('대학생 프로필 완료')).toBeTruthy();
      expect(screen.getByText('대학생 과팅')).toBeTruthy();
      expect(screen.getByText('혼자 참여')).toBeTruthy();
      expect(screen.getByText('친구와 함께')).toBeTruthy();
    });
  });

  it('hides the college entry for non-student profiles', async () => {
    mockProfile = {
      ...mockProfile,
      is_student: false,
      university_name: null,
    };

    render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('혼자 참여')).toBeTruthy();
      expect(screen.queryByText('대학생 과팅')).toBeNull();
    });
  });

  it('opens team creation in college mode from the college entry', async () => {
    render(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('대학생 과팅')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('대학생 과팅'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/team/new',
      params: { mode: 'college' },
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FRIEND_ID = '22222222-2222-4222-8222-222222222222';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockEnqueueMatchQueue = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockSearchParams = { mode: 'college' };
const mockUser = { id: USER_ID };

let mockSelfProfile: Record<string, unknown>;
let mockSearchProfiles: Record<string, unknown>[];

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/lib/notifications.stub', () => ({
  needsNotificationConsent: jest.fn(() => Promise.resolve(false)),
  registerPushToken: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/matching', () => ({
  enqueueMatchQueue: (...args: unknown[]) => mockEnqueueMatchQueue(...args),
  isMatchQueueErrorCode: jest.fn(() => false),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  collegeProfileCompleted: ({
    isStudent,
    universityName,
  }: {
    isStudent?: boolean | null;
    universityName?: string | null;
  }) => Boolean(isStudent && universityName?.trim()),
  COLLEGE_GWATING_MIN_MEMBERS: 2,
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => Promise.resolve().then(fn),
  },
  POLICY: {
    payment: { instantRematchProductId: 'booster_instant_rematch_v1' },
    team: { maxMembers: 5, minMembers: 1 },
  },
  REPORT_CATEGORIES: [],
  toMatchQueueMode: (value: unknown) => (value === 'college' ? 'college' : 'normal'),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    rpc: (...args: unknown[]) => mockSupabaseRpc(...args),
  },
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  const Text = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(RN.Text, props, children);

  return {
    AlertDialog: () => null,
    Avatar: () => null,
    Badge: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, null, children),
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
    BottomActionBar: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        RN.TouchableOpacity,
        { accessibilityRole: 'button', disabled, onPress },
        React.createElement(RN.Text, null, children),
      ),
    Card: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    Chip: ({ label }: { label?: string }) => React.createElement(RN.Text, null, label),
    Input: ({
      onChangeText,
      placeholder,
      value,
    }: {
      onChangeText?: (value: string) => void;
      placeholder?: string;
      value?: string;
    }) =>
      React.createElement(RN.TextInput, {
        onChangeText,
        placeholder,
        value,
      }),
    Text,
    TopNav: ({ title }: { title?: string }) => React.createElement(RN.Text, null, title),
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import TeamNewScreen from '../new';

function hasDisabledAncestor(node: { parent?: unknown; props?: { disabled?: boolean } } | null) {
  let current: unknown = node;
  while (current && typeof current === 'object' && 'props' in current) {
    if ((current as { props?: { disabled?: boolean } }).props?.disabled === true) {
      return true;
    }
    current = (current as { parent?: unknown }).parent;
  }
  return false;
}

function makeProfileChain() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: mockSelfProfile, error: null })),
      })),
      ilike: jest.fn(() => ({
        limit: jest.fn(() => ({
          neq: jest.fn(() => Promise.resolve({ data: mockSearchProfiles, error: null })),
        })),
      })),
    })),
  };
}

describe('TeamNewScreen — college gwating mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelfProfile = {
      is_student: true,
      nickname: '수아',
      university_name: '한국대학교',
    };
    mockSearchProfiles = [];
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profile') return makeProfileChain();
      return {};
    });
    mockSupabaseRpc.mockResolvedValue({ data: false, error: null });
    mockEnqueueMatchQueue.mockResolvedValue({
      enqueuedAt: '2026-06-11T00:00:00.000Z',
      expiresAt: null,
      memberCount: 2,
      queueId: 'queue-1',
      reused: false,
      teamId: 'team-1',
    });
  });

  it('requires at least one friend before starting a college queue', async () => {
    render(<TeamNewScreen />);

    await waitFor(() => expect(screen.getByText('친구를 1명 이상 추가해주세요')).toBeTruthy());

    expect(hasDisabledAncestor(screen.getByText('친구를 1명 이상 추가해주세요'))).toBe(true);
  });

  it('does not allow adding a friend without a completed college profile', async () => {
    mockSearchProfiles = [
      {
        is_in_active_room: false,
        is_student: false,
        nickname: '민준',
        university_name: null,
        user_id: FRIEND_ID,
      },
    ];

    render(<TeamNewScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('닉네임으로 검색'), '민준');

    await waitFor(() => expect(screen.getByText('대학생 프로필이 필요해요')).toBeTruthy(), {
      timeout: 1500,
    });
    expect(hasDisabledAncestor(screen.getByText('+ 추가'))).toBe(true);
  });

  it('enqueues eligible college teams with college mode', async () => {
    mockSearchProfiles = [
      {
        is_in_active_room: false,
        is_student: true,
        nickname: '민준',
        university_name: '다른대학교',
        user_id: FRIEND_ID,
      },
    ];

    render(<TeamNewScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('닉네임으로 검색'), '민준');
    await waitFor(() => expect(screen.getByText('초대 가능')).toBeTruthy(), {
      timeout: 1500,
    });

    fireEvent.press(screen.getByText('+ 추가'));
    await waitFor(() => expect(screen.getByText('2명으로 매칭 시작')).toBeTruthy());

    fireEvent.press(screen.getByText('2명으로 매칭 시작'));

    await waitFor(() => {
      expect(mockEnqueueMatchQueue).toHaveBeenCalledWith([USER_ID, FRIEND_ID], {
        mode: 'college',
      });
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/queue',
        params: { entrypoint: 'college', mode: 'college' },
      });
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('S3:team_queue_registered', {
        entry_point: 'college',
        member_count: 2,
        mode: 'college',
        source: 'team-new',
      });
    });
  });
});

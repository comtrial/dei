import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAnalyticsCapture = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('@/lib/profile-session-cache', () => ({
  getCachedProfileSnapshot: jest.fn(() => null),
  mergeCachedProfileSnapshot: jest.fn(),
}));

jest.mock('@/lib/permissions', () => ({
  openSystemSettings: jest.fn(),
  requestPermission: jest.fn().mockResolvedValue('granted'),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  COLLEGE_UNIVERSITY_MAX_LENGTH: 80,
  collegeProfileCompleted: ({
    isStudent,
    universityName,
  }: {
    isStudent?: boolean | null;
    universityName?: string | null;
  }) => Boolean(isStudent && universityName?.trim()),
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
  normalizeUniversityName: (value?: string | null) =>
    (value ?? '').trim().replace(/\s+/g, ' '),
  POLICY: {
    identity: { nicknameChangeThrottleDays: 30 },
    payment: { instantRematchProductId: 'booster_instant_rematch_v1' },
  },
  REPORT_CATEGORIES: [],
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    AlertDialog: () => null,
    Banner: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    BottomSheet: ({ children, visible }: { children?: React.ReactNode; visible?: boolean }) =>
      visible ? React.createElement(RN.View, null, children) : null,
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
        { disabled, onPress },
        React.createElement(RN.Text, null, children),
      ),
    Card: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    ChoiceList: () => null,
    Input: () => null,
    ProfileHero: () => null,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      React.createElement(
        RN.TouchableOpacity,
        { accessibilityRole: 'button', onPress },
        React.createElement(RN.Text, null, label),
      ),
    Spinner: () => null,
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, props, children),
    Textarea: () => null,
    TopNav: () => null,
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import MyProfileScreen from '../my-profile';

describe('MyProfileScreen — 약관 전문 보기', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('프로필의 약관 보기 행은 앱 안 약관 전문 화면으로 이동한다', () => {
    render(<MyProfileScreen />);

    fireEvent.press(screen.getByText('약관 보기'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/terms-document');
  });

  it('대학교 입력 시트는 키보드 회피 컨테이너 안에서 렌더된다', () => {
    render(<MyProfileScreen />);

    fireEvent.press(screen.getByText('대학교'));

    expect(screen.getByTestId('my-profile-editor-keyboard-avoider')).toBeTruthy();
  });
});

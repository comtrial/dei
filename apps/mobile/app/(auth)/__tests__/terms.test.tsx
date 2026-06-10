import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    ensureAnonymousSession: jest.fn().mockResolvedValue({ id: 'anon-1' }),
    user: null,
  }),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
  POLICY: {
    payment: { instantRematchProductId: 'booster_instant_rematch_v1' },
  },
  REPORT_CATEGORIES: [],
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    AlertDialog: () => null,
    Badge: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    Button: ({
      children,
      disabled,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      testID?: string;
    }) =>
      React.createElement(
        RN.TouchableOpacity,
        { disabled, onPress, testID },
        React.createElement(RN.Text, null, children),
      ),
    Card: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    Checkbox: () => null,
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, props, children),
    TopNav: () => null,
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import TermsScreen from '../terms';

describe('TermsScreen — 약관 전문 보기', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('서비스 이용약관 보기 버튼은 앱 안 약관 전문 화면으로 이동한다', () => {
    render(<TermsScreen />);

    fireEvent.press(screen.getByLabelText('서비스 이용약관 전문 보기'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/terms-document',
      params: { section: 'service' },
    });
  });
});

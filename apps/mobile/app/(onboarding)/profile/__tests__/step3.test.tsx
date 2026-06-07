import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'denied' }),
  ),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted' },
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
    addBreadcrumb: jest.fn(),
  },
  POLICY: {
    payment: { instantRematchProductId: 'instant-rematch' },
  },
  REPORT_CATEGORIES: [],
}));

jest.mock('@/lib/supabase', () => {
  const eqMock = jest.fn(() => Promise.resolve({ data: null, error: null }));
  const updateMock = jest.fn(() => ({ eq: eqMock }));
  const selectMock = jest.fn(() => ({
    eq: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  }));
  const fromMock = jest.fn((table: string) => {
    if (table === 'profile') return { update: updateMock };
    if (table === 'terms_agreement') return { select: selectMock };
    return {};
  });
  return {
    supabase: { from: fromMock, _updateMock: updateMock, _eqMock: eqMock, _fromMock: fromMock },
  };
});

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

jest.mock('@dei/ui', () => {
  const mockReactModule = jest.requireActual('react');
  const mockRN = jest.requireActual('react-native');
  return {
    AlertDialog: () => null,
    BottomSheet: () => null,
    BottomActionBar: ({ children }: { children: unknown }) =>
      mockReactModule.createElement(mockRN.View, null, children),
    Button: ({
      children,
      onPress,
      testID,
      disabled,
    }: {
      children: unknown;
      onPress?: () => void;
      testID?: string;
      disabled?: boolean;
    }) =>
      mockReactModule.createElement(
        mockRN.TouchableOpacity,
        { onPress, testID, disabled },
        mockReactModule.createElement(mockRN.Text, null, children),
      ),
    ChoiceList: () => null,
    ProgressBar: () => null,
    Select: () => null,
    Text: ({ children }: { children?: unknown }) => children ?? null,
    TopNav: () => null,
  };
});

// SUT import must run after all jest.mock() calls.
// eslint-disable-next-line import/first
import ProfileStep3Screen from '../step3';

describe('ProfileStep3Screen — onboarding_completed 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset supabase mocks to successful defaults after clearAllMocks.
    const { supabase } = jest.requireMock('@/lib/supabase');
    supabase._eqMock.mockResolvedValue({ data: null, error: null });
  });

  it('완료 버튼 누르면 onboarding_completed 이벤트가 capture 된다', async () => {
    render(<ProfileStep3Screen />);

    fireEvent.press(screen.getByTestId('onboarding-step3-finish'));

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F0:onboarding_completed');
    });
  });

  it('완료 후 router.replace(home) 이 호출된다', async () => {
    render(<ProfileStep3Screen />);

    fireEvent.press(screen.getByTestId('onboarding-step3-finish'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
  });
});

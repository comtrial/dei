import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockSignOut = jest.fn();
const mockWithdrawAccount = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('@portone/react-native-sdk', () => ({
  IdentityVerification: () => null,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('@/lib/portone.stub', () => ({
  withdrawAccount: (...args: unknown[]) => mockWithdrawAccount(...args),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => Promise.resolve().then(fn),
  },
  POLICY: {
    payment: { instantRematchProductId: 'booster_instant_rematch_v1' },
  },
  REPORT_CATEGORIES: [],
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  const Text = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(RN.Text, null, children);

  return {
    AlertDialog: ({
      actions,
      description,
      testID,
      title,
      visible,
    }: {
      actions?: { label: React.ReactNode; onPress?: () => void; testID?: string }[];
      description?: React.ReactNode;
      testID?: string;
      title: React.ReactNode;
      visible: boolean;
    }) =>
      visible
        ? React.createElement(
            RN.View,
            { testID },
            React.createElement(RN.Text, null, title),
            description ? React.createElement(RN.Text, null, description) : null,
            ...(actions ?? []).map((action, index) =>
              React.createElement(
                RN.Pressable,
                {
                  accessibilityRole: 'button',
                  key: action.testID ?? index,
                  onPress: action.onPress,
                  testID: action.testID,
                },
                React.createElement(RN.Text, null, action.label),
              ),
            ),
          )
        : null,
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
      testID,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      testID?: string;
    }) =>
      React.createElement(
        RN.Pressable,
        {
          accessibilityRole: 'button',
          accessibilityState: { disabled },
          disabled,
          onPress,
          testID,
        },
        React.createElement(RN.Text, null, children),
      ),
    ChoiceList: ({
      onChange,
      options,
      value,
    }: {
      onChange: (value: string) => void;
      options: {
        conditionalInput?: React.ReactNode;
        label: string;
        value: string;
      }[];
      value: string | null;
    }) =>
      React.createElement(
        RN.View,
        null,
        ...options.map((option) =>
          React.createElement(
            RN.View,
            { key: option.value },
            React.createElement(
              RN.Pressable,
              {
                accessibilityRole: 'radio',
                accessibilityState: { selected: value === option.value },
                onPress: () => onChange(option.value),
                testID: `withdraw-reason-${option.value}`,
              },
              React.createElement(RN.Text, null, option.label),
            ),
            value === option.value ? option.conditionalInput : null,
          ),
        ),
      ),
    IconButton: () => null,
    SlideToConfirm: ({ label }: { label?: string }) =>
      React.createElement(RN.Text, null, label),
    Spinner: () => null,
    Text,
    Textarea: ({
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
    TopNav: ({ title }: { title?: string }) =>
      React.createElement(RN.Text, null, title),
  };
});

// eslint-disable-next-line import/first -- mocks must be registered before SUT import
import WithdrawScreen from '../settings/withdraw';

function isDisabled(testID: string) {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

describe('WithdrawScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockWithdrawAccount.mockResolvedValue({ ok: true });
  });

  it('uses a final button confirmation without identity reauth or slide gesture', async () => {
    render(<WithdrawScreen />);

    expect(screen.queryByText(/본인인증 재확인/)).toBeNull();
    expect(screen.queryByText('밀어서 탈퇴하기')).toBeNull();
    expect(isDisabled('withdraw-submit')).toBe(true);

    fireEvent.press(screen.getByTestId('withdraw-reason-break'));
    expect(isDisabled('withdraw-submit')).toBe(false);

    fireEvent.press(screen.getByTestId('withdraw-submit'));
    expect(screen.getByText('정말 탈퇴할까요?')).toBeTruthy();

    fireEvent.press(screen.getByTestId('withdraw-confirm'));

    await waitFor(() => {
      expect(mockWithdrawAccount).toHaveBeenCalledWith({
        detail: undefined,
        reason: 'break',
      });
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('requires a detail when the other reason is selected', () => {
    render(<WithdrawScreen />);

    fireEvent.press(screen.getByTestId('withdraw-reason-other'));
    expect(isDisabled('withdraw-submit')).toBe(true);

    fireEvent.changeText(screen.getByPlaceholderText('떠나는 이유를 적어주세요'), '잠시 쉬려고요');
    expect(isDisabled('withdraw-submit')).toBe(false);
  });
});

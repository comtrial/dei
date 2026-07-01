import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockEnqueueMatchQueue = jest.fn();
const mockNeedsNotificationConsent = jest.fn();
const mockRegisterPushToken = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/matching', () => ({
  enqueueMatchQueue: (...args: unknown[]) => mockEnqueueMatchQueue(...args),
}));

jest.mock('@/lib/notifications.stub', () => ({
  needsNotificationConsent: (...args: unknown[]) => mockNeedsNotificationConsent(...args),
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));

jest.mock('@dei/shared', () => ({
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    AlertDialog: () => null,
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
    IconButton: ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) =>
      React.createElement(RN.TouchableOpacity, { accessibilityLabel, onPress }),
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, null, children),
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import MatchFailedScreen from '../failed';

describe('MatchFailedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnqueueMatchQueue.mockResolvedValue({ freeRematchWaived: false });
    mockNeedsNotificationConsent.mockResolvedValue(false);
    mockRegisterPushToken.mockResolvedValue(undefined);
  });

  it('restarts matching directly when notification consent is not needed', async () => {
    render(<MatchFailedScreen />);

    fireEvent.press(screen.getByText('다시 매칭 시작'));

    await waitFor(() => {
      expect(mockEnqueueMatchQueue).toHaveBeenCalledWith([], { mode: 'normal' });
    });
    expect(mockNeedsNotificationConsent).toHaveBeenCalledWith('user-1');
    expect(mockRegisterPushToken).toHaveBeenCalledWith('user-1');
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/queue',
      params: { entrypoint: 'solo', mode: 'normal' },
    });
  });
});

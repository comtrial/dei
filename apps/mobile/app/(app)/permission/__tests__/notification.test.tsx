import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockEnqueueMatchQueue = jest.fn();
const mockGetAppNotificationEnabled = jest.fn();
const mockGetPermissionState = jest.fn();
const mockIsMatchQueueErrorCode = jest.fn();
const mockOpenSystemSettings = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockRequestPermission = jest.fn();
const mockSetAppNotificationEnabled = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ entrypoint: 'solo', memberIds: 'user-1', mode: 'normal' }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/matching', () => ({
  enqueueMatchQueue: (...args: unknown[]) => mockEnqueueMatchQueue(...args),
  isMatchQueueErrorCode: (...args: unknown[]) => mockIsMatchQueueErrorCode(...args),
}));

jest.mock('@/lib/notifications.stub', () => ({
  getAppNotificationEnabled: (...args: unknown[]) => mockGetAppNotificationEnabled(...args),
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
  setAppNotificationEnabled: (...args: unknown[]) => mockSetAppNotificationEnabled(...args),
}));

jest.mock('@/lib/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
  openSystemSettings: (...args: unknown[]) => mockOpenSystemSettings(...args),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
  },
  toMatchQueueMode: (value: unknown) => (value === 'college' ? 'college' : 'normal'),
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    AlertDialog: () => null,
    PermissionGate: ({
      heading,
      onPrimary,
      onSecondary,
      primaryLabel,
      secondaryLabel,
    }: {
      heading: string;
      onPrimary: () => void;
      onSecondary: () => void;
      primaryLabel: string;
      secondaryLabel: string;
    }) =>
      React.createElement(
        RN.View,
        null,
        React.createElement(RN.Text, null, heading),
        React.createElement(
          RN.TouchableOpacity,
          { onPress: onPrimary, testID: 'notification-primary' },
          React.createElement(RN.Text, null, primaryLabel),
        ),
        React.createElement(
          RN.TouchableOpacity,
          { onPress: onSecondary, testID: 'notification-secondary' },
          React.createElement(RN.Text, null, secondaryLabel),
        ),
      ),
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import NotificationPermissionScreen from '../notification';

describe('NotificationPermissionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnqueueMatchQueue.mockResolvedValue({
      freeRematchWaived: false,
    });
    mockGetAppNotificationEnabled.mockResolvedValue(true);
    mockGetPermissionState.mockResolvedValue('denied');
    mockIsMatchQueueErrorCode.mockReturnValue(false);
    mockRegisterPushToken.mockResolvedValue(undefined);
    mockRequestPermission.mockResolvedValue('denied');
    mockSetAppNotificationEnabled.mockResolvedValue(undefined);
  });

  it('continues queue registration when the user denies the iOS notification prompt', async () => {
    render(<NotificationPermissionScreen />);

    fireEvent.press(screen.getByTestId('notification-primary'));

    await waitFor(() => {
      expect(mockEnqueueMatchQueue).toHaveBeenCalledWith(['user-1'], { mode: 'normal' });
    });
    expect(mockOpenSystemSettings).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(mockSetAppNotificationEnabled).toHaveBeenLastCalledWith('user-1', false);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/queue',
      params: { entrypoint: 'solo', mode: 'normal' },
    });
  });

  it('continues queue registration from the secondary CTA without requesting permission', async () => {
    render(<NotificationPermissionScreen />);

    fireEvent.press(screen.getByTestId('notification-secondary'));

    await waitFor(() => {
      expect(mockEnqueueMatchQueue).toHaveBeenCalledWith(['user-1'], { mode: 'normal' });
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(mockSetAppNotificationEnabled).toHaveBeenCalledWith('user-1', false);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/queue',
      params: { entrypoint: 'solo', mode: 'normal' },
    });
  });
});

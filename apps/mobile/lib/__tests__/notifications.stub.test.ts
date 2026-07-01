import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  notificationMaybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@dei/shared', () => ({
  logger: {
    captureMessage: mocks.captureMessage,
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    easConfig: { projectId: 'project-1' },
    expoConfig: { extra: { eas: { projectId: 'project-1' } } },
  },
}));

vi.mock('expo-notifications', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  getExpoPushTokenAsync: (...args: unknown[]) => mocks.getExpoPushTokenAsync(...args),
  getPermissionsAsync: (...args: unknown[]) => mocks.getPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mocks.requestPermissionsAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mocks.setNotificationHandler(...args),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: (...args: unknown[]) => mocks.notificationMaybeSingle(...args),
      select: vi.fn().mockReturnThis(),
      upsert: mocks.upsert,
    }),
  },
}));

// eslint-disable-next-line import/first
import {
  configureForegroundNotifications,
  isPushTokenRegistrationUnavailable,
  needsNotificationConsent,
  registerPushToken,
} from '../notifications.stub';

beforeEach(() => {
  mocks.captureMessage.mockReset();
  mocks.getExpoPushTokenAsync.mockReset();
  mocks.getPermissionsAsync.mockReset();
  mocks.requestPermissionsAsync.mockReset();
  mocks.setNotificationHandler.mockReset();
  mocks.notificationMaybeSingle.mockReset();
  mocks.notificationMaybeSingle.mockResolvedValue({ data: { push_enabled: true }, error: null });
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
});

describe('notifications.stub registerPushToken', () => {
  it('skips registration when the iOS build has no aps-environment entitlement', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mocks.getExpoPushTokenAsync.mockRejectedValue(
      new Error("응용 프로그램을 위한 유효한 'aps-environment' 인타이틀먼트 문자열을 찾을 수 없습니다."),
    );

    await registerPushToken('user-1');

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'push token registration unavailable for this build',
      'warning',
      expect.objectContaining({
        tags: { feature: 'notifications', action: 'register-push-token' },
      }),
    );
  });

  it('rethrows unexpected Expo token errors', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mocks.getExpoPushTokenAsync.mockRejectedValue(new Error('network down'));

    await expect(registerPushToken('user-1')).rejects.toThrow('network down');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('detects aps-environment token registration errors', () => {
    expect(isPushTokenRegistrationUnavailable(new Error('missing aps-environment'))).toBe(true);
    expect(isPushTokenRegistrationUnavailable(new Error('network down'))).toBe(false);
  });

  it('configures foreground notification presentation once', async () => {
    configureForegroundNotifications();
    configureForegroundNotifications();

    expect(mocks.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mocks.setNotificationHandler.mock.calls[0]?.[0] as {
      handleNotification: () => Promise<Record<string, unknown>>;
    };
    await expect(handler.handleNotification()).resolves.toMatchObject({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('prompts for consent while OS notification permission is undetermined', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    await expect(needsNotificationConsent('user-1')).resolves.toBe(true);
  });

  it('does not require consent when OS notification permission was denied', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(needsNotificationConsent('user-1')).resolves.toBe(false);
  });

  it('does not require consent when the in-app notification setting is off', async () => {
    mocks.notificationMaybeSingle.mockResolvedValue({ data: { push_enabled: false }, error: null });
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await expect(needsNotificationConsent('user-1')).resolves.toBe(false);
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not require consent when app setting and OS permission are enabled', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await expect(needsNotificationConsent('user-1')).resolves.toBe(false);
  });
});

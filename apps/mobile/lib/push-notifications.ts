import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@dei/shared';

import type { RegisterPushTokenInput } from '@/lib/notifications';
import {
  buildRegisterPushTokenArgs,
  getExpoProjectIdFromConstants,
  getPushRouteFromData,
  normalizePushPlatform,
} from '@/lib/push-notifications.helpers';
import { supabase } from '@/lib/supabase';

/**
 * Phase 1 정리: 1:1 채팅 active conversation tracking 제거.
 * 옛 도메인의 "현재 보고 있는 채팅방 푸시는 무음 처리" 기능을 새 도메인(방)에
 * 다시 도입할 시점은 Phase 3 — 그때 `getActiveRoomPushTracking()` 같은 새
 * state 모듈로 추가하면 된다. 지금은 단순화 (suppress 로직 제거).
 */

const INSTALLATION_ID_STORAGE_KEY = 'dei.push.installationId.v1';
const ANDROID_DEFAULT_CHANNEL_ID = 'default';

let didConfigureForegroundNotifications = false;

export type PushRegistrationResult =
  | {
      ok: true;
      platform: RegisterPushTokenInput['platform'];
      pushProvider: 'expo';
      pushToken: string;
    }
  | {
      ok: false;
      reason:
        | 'missing-project-id'
        | 'not-authenticated'
        | 'permission-denied'
        | 'register-error'
        | 'token-error'
        | 'unsupported-platform';
    };

function createInstallationId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('-');
}

async function getInstallationIdHash() {
  const storedValue = await AsyncStorage.getItem(INSTALLATION_ID_STORAGE_KEY);

  if (storedValue && storedValue.length >= 16 && storedValue.length <= 256) {
    return storedValue;
  }

  const nextValue = createInstallationId();
  await AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, nextValue);
  return nextValue;
}

export function getExpoProjectId() {
  return getExpoProjectIdFromConstants(Constants);
}

export async function configureForegroundPushNotifications() {
  if (didConfigureForegroundNotifications || Platform.OS === 'web') {
    return;
  }

  didConfigureForegroundNotifications = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: 'default',
      showBadge: true,
    });
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'notifications', action: 'configure-channel' },
    });
  }
}

export async function requestAndRegisterPushToken(
  userId: string | undefined,
): Promise<PushRegistrationResult> {
  if (!userId) {
    return { ok: false, reason: 'not-authenticated' };
  }

  const platform = normalizePushPlatform(Platform.OS);

  if (!platform || platform === 'web') {
    return { ok: false, reason: 'unsupported-platform' };
  }

  const projectId = getExpoProjectId();

  if (!projectId) {
    logger.captureException(new Error('Expo projectId is not configured'), {
      tags: { feature: 'notifications', action: 'get-project-id' },
      extra: { userId },
    });
    return { ok: false, reason: 'missing-project-id' };
  }

  await configureForegroundPushNotifications();

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission = existingPermission.granted
    ? existingPermission
    : await Notifications.requestPermissionsAsync();

  if (!permission.granted) {
    return { ok: false, reason: 'permission-denied' };
  }

  let pushToken: string;

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    pushToken = token.data;
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'notifications', action: 'get-expo-push-token' },
      extra: { platform, userId },
    });
    return { ok: false, reason: 'token-error' };
  }

  try {
    const { error } = await supabase.rpc('register_user_push_token', buildRegisterPushTokenArgs({
      appVersion: Constants.expoConfig?.version ?? null,
      deviceLabel: Constants.deviceName ?? null,
      installationIdHash: await getInstallationIdHash(),
      platform,
      pushProvider: 'expo',
      pushToken,
    }));

    if (error) {
      throw error;
    }
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'notifications', action: 'register-device-push-token' },
      extra: { platform, userId },
    });
    return { ok: false, reason: 'register-error' };
  }

  return {
    ok: true,
    platform,
    pushProvider: 'expo',
    pushToken,
  };
}

export function addPushResponseListener(
  listener: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function getLastPushResponse() {
  return Notifications.getLastNotificationResponse();
}

export function clearLastPushResponse() {
  Notifications.clearLastNotificationResponse();
}

export function getPushRouteFromResponse(response: Notifications.NotificationResponse) {
  return getPushRouteFromData(response.notification.request.content.data);
}

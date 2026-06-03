import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@dei/shared';

import type { PermissionState } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

const PUSH_DISPATCH_HANDOFF = 'handoff: 서버 푸시 발송(A 인프라) 구현 예정';

function normalizeNotificationStatus(status: Notifications.PermissionStatus): PermissionState {
  if (status === Notifications.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Notifications.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

/** 알림 권한 상태를 OS 권한 API로 조회한다. */
export async function getNotificationPermissionState(): Promise<PermissionState> {
  const permission = await Notifications.getPermissionsAsync();
  return normalizeNotificationStatus(permission.status);
}

/** 알림 권한을 OS 다이얼로그로 요청한다. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const permission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return normalizeNotificationStatus(permission.status);
}

function getExpoProjectId() {
  return (
    Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? null
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isPushTokenRegistrationUnavailable(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes('aps-environment');
}

/** 디바이스 Expo push token 을 Supabase push_token 테이블에 저장한다. */
export async function registerPushToken(userId: string): Promise<void> {
  const permission = await getNotificationPermissionState();
  if (permission !== 'granted') {
    throw new Error('알림 권한이 필요해요.');
  }

  const projectId = getExpoProjectId();
  let token: Notifications.ExpoPushToken;
  try {
    token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
  } catch (error) {
    if (isPushTokenRegistrationUnavailable(error)) {
      logger.captureMessage('push token registration unavailable for this build', 'warning', {
        tags: { feature: 'notifications', action: 'register-push-token' },
        extra: { reason: getErrorMessage(error) },
      });
      return;
    }

    throw error;
  }

  const { error } = await supabase.from('push_token').upsert(
    {
      platform: Platform.OS,
      token: token.data,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: 'user_id,token' },
  );

  if (error) {
    throw error;
  }
}

export async function getAppNotificationEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_setting')
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.push_enabled ?? true;
}

export async function setAppNotificationEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('notification_setting')
    .upsert({
      chat_mention: enabled,
      match_alert: enabled,
      push_enabled: enabled,
      upload_reminder: enabled,
      user_id: userId,
    }, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

/** 푸시 발송(서버 디스패처 경로). 새벽 0~7 KST 차단은 서버 정책으로 적용. */
export async function sendPush(_payload: { userId: string; title: string; body: string }): Promise<void> {
  throw new Error(PUSH_DISPATCH_HANDOFF);
}

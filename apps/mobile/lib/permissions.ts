/**
 * 권한 게이트 공통 패턴 (spec §3.3 · A-4)
 * ------------------------------------------------------------------
 * 카메라(S11a)·알림(S07a) 권한 게이트가 공유하는 단일 진입점. 화면은
 * `@dei/ui` 의 `PermissionGate` 패턴 컴포넌트로 UI 를 그리고, 실제 권한
 * 상태 조회·요청·시스템설정 deeplink 는 이 모듈을 통한다.
 *
 * 담당 경계(D-12):
 *   - 카메라: expo-camera 가 설치돼 있어 실제 요청 가능(C 영상 담당이 확장).
 *   - 알림: expo-notifications 는 이번 범위에서 *미설치*. 알림 권한 흐름은
 *     `notifications.stub.ts` 를 통해 후속 담당(푸시=A 인프라 / 설정표면 B)이
 *     채운다. 여기서는 시스템설정 deeplink 와 게이트 형태만 제공한다.
 */
import { Camera } from 'expo-camera';
import * as Linking from 'expo-linking';

import {
  getNotificationPermissionState,
  requestNotificationPermission,
} from '@/lib/notifications.stub';

export type PermissionKind = 'camera' | 'notification';
export type PermissionState = 'granted' | 'denied' | 'undetermined';

/**
 * OS 설정 앱(본 앱의 권한 페이지)으로 보낸다. 사용자가 한 번 거부한 권한은
 * 인앱 재요청이 막히므로(iOS), 게이트의 "설정에서 켜기" CTA 가 이걸 호출한다.
 */
export async function openSystemSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * 권한 상태를 조회한다.
 *
 * - camera: expo-camera 의 권한 API 로 실제 조회.
 * - notification: 미설치 모듈이라 stub 으로 위임 → 항상 'undetermined'.
 */
export async function getPermissionState(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'camera') {
    const { status } = await Camera.getCameraPermissionsAsync();
    return normalize(status);
  }
  return getNotificationPermissionState();
}

/**
 * 권한을 요청한다. 이미 거부 상태면 인앱 요청이 무시될 수 있으니 게이트는
 * 반환값이 'denied' 일 때 `openSystemSettings()` 로 유도한다.
 */
export async function requestPermission(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'camera') {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return normalize(status);
  }
  return requestNotificationPermission();
}

function normalize(status: string): PermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

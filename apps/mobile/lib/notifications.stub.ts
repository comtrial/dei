/**
 * ⚠️ HANDOFF STUB — 푸시/로컬 알림 (D-12, 이번 셋팅에서 미구현)
 * ==================================================================
 * 담당: 인프라·디스패처 = A / 설정 표면(S22·S07a) = B / 트리거 = 각 도메인.
 * 이 파일은 *인터페이스 경계* 만 고정한다. 실제 구현(expo-notifications 도입,
 * 토큰 등록, APNs/FCM, 새벽 0~7 KST 차단 정책 — policy.ts `quietHours` 참조)은
 * 후속 담당이 채운다.
 *
 * 규칙:
 *   - 상태 *조회* 함수는 게이트 UI 가 런타임에 호출하므로 throw 하지 않고
 *     안전한 placeholder('undetermined')를 돌려준다(앱이 죽지 않게).
 *   - 실제 *발송/등록* 함수는 호출되면 명확히 throw 해서 미구현을 드러낸다.
 *   - expo-notifications 는 *아직 미설치*. 도입 시 이 stub 을 실제 구현으로 교체.
 */
import { logger } from '@dei/shared';

import type { PermissionState } from '@/lib/permissions';

const HANDOFF = 'handoff: 알림(A 인프라/B 설정표면) 구현 예정';

/** 알림 권한 상태. 미구현이므로 항상 undetermined(게이트가 안내를 띄우도록). */
export async function getNotificationPermissionState(): Promise<PermissionState> {
  logger.captureMessage('notifications.stub: getPermissionState 호출(미구현)', 'debug', {
    tags: { feature: 'notifications', stub: 'true' },
  });
  return 'undetermined';
}

/** 알림 권한 요청. 미구현 — 게이트는 결과 undetermined 로 시스템설정 유도. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  logger.captureMessage('notifications.stub: requestPermission 호출(미구현)', 'debug', {
    tags: { feature: 'notifications', stub: 'true' },
  });
  return 'undetermined';
}

/** 디바이스 푸시 토큰 등록. 구현 시 Supabase `notification_setting`/토큰 테이블 연동. */
export async function registerPushToken(_userId: string): Promise<void> {
  throw new Error(HANDOFF);
}

/** 푸시 발송(서버 디스패처 경로). 새벽 0~7 KST 차단은 서버 정책으로 적용. */
export async function sendPush(_payload: { userId: string; title: string; body: string }): Promise<void> {
  throw new Error(HANDOFF);
}

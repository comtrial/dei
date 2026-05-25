import type { RegisterPushTokenInput } from '@/lib/notifications';

/**
 * 푸시 알림 헬퍼.
 *
 * Phase 1 정리: 1:1 채팅 conversation deeplink 파싱 로직 제거.
 * 새 도메인(방/묶음) deeplink 매핑은 Phase 3 에서 추가 — 매핑 표는
 * docs/rooms-spec/screens.md 의 "라우팅 deeplink" 섹션 참고.
 *
 * 현재 살아있는 로직: project id 추출, platform normalize,
 * register_user_push_token RPC payload 빌드, generic `data.route` 사용.
 */

export type PushRegistrationPlatform = RegisterPushTokenInput['platform'];

type ExpoConstantsLike = {
  easConfig?: { projectId?: string | null } | null;
  expoConfig?: { extra?: Record<string, unknown> | null } | null;
  manifest2?: {
    extra?: {
      expoClient?: {
        extra?: Record<string, unknown> | null;
      } | null;
    } | null;
  } | null;
};

export type RegisterPushTokenRpcArgs = {
  p_app_version: string | undefined;
  p_device_label: string | undefined;
  p_installation_id_hash: string;
  p_platform: PushRegistrationPlatform;
  p_push_provider: NonNullable<RegisterPushTokenInput['pushProvider']>;
  p_push_token: string;
};

function readProjectIdFromExtra(extra: Record<string, unknown> | null | undefined) {
  const eas = extra?.eas;

  if (!eas || typeof eas !== 'object' || Array.isArray(eas)) {
    return null;
  }

  const projectId = (eas as { projectId?: unknown }).projectId;
  return typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
}

export function getExpoProjectIdFromConstants(constants: ExpoConstantsLike) {
  const easProjectId = constants.easConfig?.projectId?.trim();

  return (
    easProjectId
    || readProjectIdFromExtra(constants.expoConfig?.extra)
    || readProjectIdFromExtra(constants.manifest2?.extra?.expoClient?.extra)
    || null
  );
}

export function normalizePushPlatform(os: string): PushRegistrationPlatform | null {
  if (os === 'ios' || os === 'android' || os === 'web') {
    return os;
  }

  return null;
}

export function buildRegisterPushTokenArgs(
  input: RegisterPushTokenInput,
): RegisterPushTokenRpcArgs {
  return {
    p_app_version: input.appVersion?.trim() || undefined,
    p_device_label: input.deviceLabel?.trim() || undefined,
    p_installation_id_hash: input.installationIdHash.trim(),
    p_platform: input.platform,
    p_push_provider: input.pushProvider ?? 'expo',
    p_push_token: input.pushToken.trim(),
  };
}

/**
 * Push payload 의 `data.route` 를 expo-router 가 받을 수 있는 in-app pathname 으로
 * 정규화한다. 외부 URL 또는 dei:// 같은 deeplink 는 거부하고 in-app 경로만 통과.
 *
 * Phase 1 정리 후 의도적으로 매우 단순함 — 옛 chat conversation deeplink 파싱
 * 로직 제거. 새 도메인 deeplink 매핑은 Phase 3 에서 이 함수에 case 를 추가하는
 * 형태로 확장 (예: `dei://room/<id>/upload` → `/room/<id>/upload`).
 */
export function getPushRouteFromData(data: Record<string, unknown> | null | undefined) {
  const route = data?.route;

  if (typeof route !== 'string') {
    return null;
  }

  const trimmedRoute = route.trim();
  if (!trimmedRoute.startsWith('/') || trimmedRoute.startsWith('//')) {
    return null;
  }

  return trimmedRoute;
}

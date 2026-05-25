import type { RegisterPushTokenInput } from '@/lib/notifications';

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

export function getPushRouteFromData(data: Record<string, unknown> | null | undefined) {
  const route = data?.route;

  if (typeof route !== 'string') {
    return null;
  }

  const trimmedRoute = route.trim();
  return trimmedRoute.startsWith('/') ? trimmedRoute : null;
}

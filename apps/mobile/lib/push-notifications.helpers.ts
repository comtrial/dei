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

export function getPushConversationIdFromData(data: Record<string, unknown> | null | undefined) {
  const conversationId = data?.conversationId;

  if (typeof conversationId === 'string' && conversationId.trim()) {
    return conversationId.trim();
  }

  return getConversationIdFromRoute(typeof data?.route === 'string' ? data.route : null);
}

function getConversationIdFromRoute(route: string | null | undefined) {
  const trimmedRoute = route?.trim();

  if (!trimmedRoute) {
    return null;
  }

  if (trimmedRoute.startsWith('/chat?')) {
    const params = new URLSearchParams(trimmedRoute.slice(trimmedRoute.indexOf('?') + 1));
    const conversationId = params.get('conversationId')?.trim();
    return conversationId || null;
  }

  if (!trimmedRoute.startsWith('dei://')) {
    return null;
  }

  try {
    const url = new URL(trimmedRoute);

    if (url.hostname !== 'chat') {
      return null;
    }

    const conversationId = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
    return conversationId || null;
  } catch {
    return null;
  }
}

function chatRouteFromConversationId(conversationId: string) {
  return `/chat?conversationId=${encodeURIComponent(conversationId)}&source=push`;
}

export function getPushRouteFromData(data: Record<string, unknown> | null | undefined) {
  const route = data?.route;
  const conversationId = getPushConversationIdFromData(data);

  if (conversationId) {
    return chatRouteFromConversationId(conversationId);
  }

  if (typeof route !== 'string') {
    return null;
  }

  const trimmedRoute = route.trim();
  if (!trimmedRoute.startsWith('/') || trimmedRoute.startsWith('//')) {
    return null;
  }

  return trimmedRoute;
}

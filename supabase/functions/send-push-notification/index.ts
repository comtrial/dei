import { createAdminClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type SendPushNotificationBody = {
  body?: string | null;
  data?: Record<string, unknown>;
  notificationId?: string | null;
  route?: string | null;
  title?: string;
  userId?: string;
};

type NotificationRow = {
  body: string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  route: string | null;
  title: string;
  type: string;
  user_id: string;
};

type UserDeviceRow = {
  id: string;
  push_token: string | null;
};

type ExpoPushMessage = {
  body?: string;
  channelId: string;
  data: Record<string, unknown>;
  sound: 'default';
  title: string;
  to: string;
};

type ExpoPushTicket = {
  details?: { error?: string };
  id?: string;
  message?: string;
  status: 'ok' | 'error';
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: unknown[];
};

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_MAX_MESSAGES_PER_REQUEST = 100;
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

function getBearerToken(req: Request) {
  return req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? null;
}

function requireServiceRole(req: Request) {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!serviceRoleKey || getBearerToken(req) !== serviceRoleKey) {
    return false;
  }

  return true;
}

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function loadNotification(notificationId: string) {
  const supabase = createAdminClient();
  const result = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, route, metadata')
    .eq('id', notificationId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as NotificationRow | null;
}

async function sendExpoMessages(messages: ExpoPushMessage[]) {
  const ticketsByIndex = new Array<ExpoPushTicket | null>(messages.length).fill(null);
  const errors: unknown[] = [];

  for (let index = 0; index < messages.length; index += EXPO_MAX_MESSAGES_PER_REQUEST) {
    const messageChunk = messages.slice(index, index + EXPO_MAX_MESSAGES_PER_REQUEST);
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      body: JSON.stringify(messageChunk),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const payload = await response.json().catch(() => ({})) as ExpoPushResponse;

    if (!response.ok) {
      errors.push({
        body: payload,
        status: response.status,
      });
      continue;
    }

    (payload.data ?? []).forEach((ticket, offset) => {
      ticketsByIndex[index + offset] = ticket;
    });

    if (payload.errors?.length) {
      errors.push(...payload.errors);
    }
  }

  return { errors, ticketsByIndex };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  if (!requireServiceRole(req)) {
    return errorResponse('unauthorized', 401);
  }

  try {
    const supabase = createAdminClient();
    const body = await req.json() as SendPushNotificationBody;
    const notificationId = trimToNull(body.notificationId);
    const notification = notificationId ? await loadNotification(notificationId) : null;

    if (notificationId && !notification) {
      return errorResponse('notification not found', 404);
    }

    const userId = trimToNull(body.userId) ?? notification?.user_id ?? null;

    if (!userId) {
      return errorResponse('userId is required');
    }

    if (notification && body.userId && body.userId !== notification.user_id) {
      return errorResponse('notification does not belong to userId', 409);
    }

    const title = trimToNull(body.title) ?? notification?.title ?? null;

    if (!title) {
      return errorResponse('title is required');
    }

    const messageBody = trimToNull(body.body) ?? notification?.body ?? undefined;
    const route = trimToNull(body.route) ?? notification?.route ?? null;
    const requestData = isRecord(body.data) ? body.data : {};
    const notificationMetadata = isRecord(notification?.metadata) ? notification?.metadata : {};
    const pushData = {
      ...requestData,
      notificationId: notification?.id ?? notificationId ?? undefined,
      notificationType: notification?.type ?? requestData.notificationType,
      route: route ?? undefined,
      source: requestData.source ?? 'send-push-notification',
      metadata: requestData.metadata ?? notificationMetadata,
    };

    const devicesResult = await supabase
      .from('user_devices')
      .select('id, push_token')
      .eq('user_id', userId)
      .eq('push_provider', 'expo')
      .is('revoked_at', null)
      .not('push_token', 'is', null);

    if (devicesResult.error) {
      throw devicesResult.error;
    }

    const devices = ((devicesResult.data ?? []) as UserDeviceRow[])
      .filter((device) => trimToNull(device.push_token));

    if (devices.length === 0) {
      return jsonResponse({
        failed: 0,
        ok: true,
        reason: 'no-active-push-token',
        revokedDeviceIds: [],
        sent: 0,
      });
    }

    const messages = devices.map((device) => ({
      body: messageBody,
      channelId: 'default',
      data: pushData,
      sound: 'default' as const,
      title,
      to: device.push_token!,
    }));
    const { errors, ticketsByIndex } = await sendExpoMessages(messages);
    const revokedDeviceIds: string[] = [];
    let sent = 0;
    let failed = 0;

    ticketsByIndex.forEach((ticket, index) => {
      if (!ticket) {
        failed += 1;
        return;
      }

      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }

      failed += 1;

      if (ticket.details?.error === DEVICE_NOT_REGISTERED) {
        const deviceId = devices[index]?.id;

        if (deviceId) {
          revokedDeviceIds.push(deviceId);
        }
      }
    });

    if (revokedDeviceIds.length > 0) {
      const revokeResult = await supabase
        .from('user_devices')
        .update({
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', revokedDeviceIds);

      if (revokeResult.error) {
        throw revokeResult.error;
      }
    }

    return jsonResponse({
      failed,
      expoErrorCount: errors.length,
      ok: true,
      revokedDeviceIds,
      sent,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'failed to send push notification',
      400,
    );
  }
});

type UserDeviceRow = {
  id: string;
  push_token: string | null;
};

type ExpoPushMessage = {
  body?: string;
  channelId: string;
  data: Record<string, unknown>;
  sound: "default";
  title: string;
  to: string;
};

type ExpoPushTicket = {
  details?: { error?: string };
  id?: string;
  message?: string;
  status: "ok" | "error";
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: unknown[];
};

export type SendPushToUserInput = {
  body?: string | null;
  channelId?: string;
  data?: Record<string, unknown>;
  notificationId?: string | null;
  route?: string | null;
  title: string;
  userId: string;
};

export type CreateNotificationAndPushInput = SendPushToUserInput & {
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  skipIfDedupeExists?: boolean;
  type: string;
};

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_MAX_MESSAGES_PER_REQUEST = 100;
const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function sendExpoMessages(messages: ExpoPushMessage[]) {
  const ticketsByIndex = new Array<ExpoPushTicket | null>(messages.length).fill(
    null,
  );
  const errors: unknown[] = [];

  for (
    let index = 0;
    index < messages.length;
    index += EXPO_MAX_MESSAGES_PER_REQUEST
  ) {
    const messageChunk = messages.slice(
      index,
      index + EXPO_MAX_MESSAGES_PER_REQUEST,
    );
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      body: JSON.stringify(messageChunk),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
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

export async function sendPushToUser(
  supabase: any,
  input: SendPushToUserInput,
) {
  const devicesResult = await supabase
    .from("user_devices")
    .select("id, push_token")
    .eq("user_id", input.userId)
    .eq("push_provider", "expo")
    .is("revoked_at", null)
    .not("push_token", "is", null);

  if (devicesResult.error) {
    throw devicesResult.error;
  }

  const devices = ((devicesResult.data ?? []) as UserDeviceRow[])
    .filter((device) => trimToNull(device.push_token));

  if (devices.length === 0) {
    return {
      failed: 0,
      ok: true,
      reason: "no-active-push-token",
      revokedDeviceIds: [],
      sent: 0,
    };
  }

  const route = trimToNull(input.route);
  const pushData = {
    ...(input.data ?? {}),
    notificationId: input.notificationId ?? undefined,
    route: route ?? undefined,
    source: input.data?.source ?? "push-policy",
  };
  const messages = devices.map((device) => ({
    body: trimToNull(input.body) ?? undefined,
    channelId: input.channelId ?? "default",
    data: pushData,
    sound: "default" as const,
    title: input.title.trim(),
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

    if (ticket.status === "ok") {
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
      .from("user_devices")
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", revokedDeviceIds);

    if (revokeResult.error) {
      throw revokeResult.error;
    }
  }

  return {
    failed,
    expoErrorCount: errors.length,
    ok: true,
    revokedDeviceIds,
    sent,
  };
}

export async function createNotificationAndPush(
  supabase: any,
  input: CreateNotificationAndPushInput,
) {
  const dedupeKey = trimToNull(input.dedupeKey);

  if (input.skipIfDedupeExists && dedupeKey) {
    const existingResult = await supabase
      .from("notifications")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existingResult.error) {
      throw existingResult.error;
    }

    if (existingResult.data?.id) {
      return {
        failed: 0,
        notificationId: existingResult.data.id,
        ok: true,
        reason: "dedupe-exists",
        revokedDeviceIds: [],
        sent: 0,
      };
    }
  }

  const notificationResult = await supabase.rpc("create_notification", {
    p_body: input.body ?? null,
    p_dedupe_key: dedupeKey,
    p_metadata: input.metadata ?? {},
    p_route: input.route ?? null,
    p_title: input.title,
    p_type: input.type,
    p_user_id: input.userId,
  });

  if (notificationResult.error) {
    throw notificationResult.error;
  }

  return await sendPushToUser(supabase, {
    body: input.body,
    data: {
      ...(input.data ?? {}),
      metadata: input.metadata ?? {},
      notificationType: input.type,
    },
    notificationId: notificationResult.data ?? null,
    route: input.route,
    title: input.title,
    userId: input.userId,
  });
}

export async function getProfileDisplayName(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const nickname = typeof data?.nickname === "string"
    ? data.nickname.trim()
    : "";
  return nickname || "새로운 사람";
}

export function chatPushRoute(conversationId: string) {
  return `dei://chat/${encodeURIComponent(conversationId)}`;
}

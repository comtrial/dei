import { createAdminClient, isServiceRoleRequest } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { sendPushToUser } from "../_shared/push.ts";

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

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function loadNotification(notificationId: string) {
  const supabase = createAdminClient();
  const result = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, route, metadata")
    .eq("id", notificationId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as NotificationRow | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method not allowed", 405);
  }

  if (!isServiceRoleRequest(req)) {
    return errorResponse("unauthorized", 401);
  }

  try {
    const supabase = createAdminClient();
    const body = await req.json() as SendPushNotificationBody;
    const notificationId = trimToNull(body.notificationId);
    const notification = notificationId
      ? await loadNotification(notificationId)
      : null;

    if (notificationId && !notification) {
      return errorResponse("notification not found", 404);
    }

    const userId = trimToNull(body.userId) ?? notification?.user_id ?? null;

    if (!userId) {
      return errorResponse("userId is required");
    }

    if (notification && body.userId && body.userId !== notification.user_id) {
      return errorResponse("notification does not belong to userId", 409);
    }

    const title = trimToNull(body.title) ?? notification?.title ?? null;

    if (!title) {
      return errorResponse("title is required");
    }

    const messageBody = trimToNull(body.body) ?? notification?.body ??
      undefined;
    const route = trimToNull(body.route) ?? notification?.route ?? null;
    const result = await sendPushToUser(supabase, {
      body: messageBody,
      data: {
        ...(body.data ?? {}),
        metadata: body.data?.metadata ?? notification?.metadata ?? {},
        notificationType: notification?.type ?? body.data?.notificationType,
      },
      notificationId: notification?.id ?? notificationId,
      route,
      title,
      userId,
    });

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "failed to send push notification",
      400,
    );
  }
});

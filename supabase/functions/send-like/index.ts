import { getAuthenticatedUser } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getProfileDisplayName, sendPushToUser } from "../_shared/push.ts";

type SendLikeBody = {
  attachedLogId?: string | null;
  toUserId?: string;
};

type LikeRow = {
  attached_log_id: string | null;
  from_user_id: string;
  id: string;
  status: string;
  to_user_id: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method not allowed", 405);
  }

  try {
    const { supabase, supabaseAsUser } = await getAuthenticatedUser(req);

    let body: SendLikeBody;
    try {
      body = (await req.json()) as SendLikeBody;
    } catch {
      return errorResponse("invalid json body", 400);
    }

    const toUserId = body.toUserId?.trim();

    if (!toUserId) {
      return errorResponse("toUserId is required", 400);
    }

    const likeResult = await supabaseAsUser.rpc("send_like", {
      p_attached_log_id: body.attachedLogId ?? undefined,
      p_to_user_id: toUserId,
    });

    if (likeResult.error) {
      return errorResponse(
        likeResult.error.message ?? "failed to send like",
        400,
      );
    }

    const like = likeResult.data as LikeRow;
    let pushResult;

    try {
      const senderName = await getProfileDisplayName(
        supabase,
        like.from_user_id,
      );
      pushResult = await sendPushToUser(supabase, {
        body: `${senderName}님이 좋아요를 보냈어요.`,
        data: {
          fromUserId: like.from_user_id,
          likeId: like.id,
          notificationType: "like_received",
          source: "send-like",
        },
        route: "/likes?tab=received",
        title: "새 좋아요가 도착했어요",
        userId: like.to_user_id,
      });
    } catch (pushError) {
      pushResult = {
        error: pushError instanceof Error
          ? pushError.message
          : "failed to send push",
        ok: false,
      };
    }

    return jsonResponse({
      like,
      push: pushResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "failed to send like";
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401);
    }
    return errorResponse(msg, 500);
  }
});

import { getAuthenticatedUser } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import {
  chatPushRoute,
  createNotificationAndPush,
  getProfileDisplayName,
} from "../_shared/push.ts";

type AcceptLikeBody = {
  likeId?: string;
};

type AcceptLikeRow = {
  counterpart_id: string;
  match_id: string;
};

type ConversationRow = {
  id: string;
  match_id: string;
  status: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method not allowed", 405);
  }

  try {
    const { supabase, supabaseAsUser, user } = await getAuthenticatedUser(req);

    let body: AcceptLikeBody;
    try {
      body = (await req.json()) as AcceptLikeBody;
    } catch {
      return errorResponse("invalid json body", 400);
    }

    const likeId = body.likeId?.trim();

    if (!likeId) {
      return errorResponse("likeId is required", 400);
    }

    const acceptResult = await supabaseAsUser.rpc("accept_like", {
      p_like_id: likeId,
    });

    if (acceptResult.error) {
      return errorResponse(
        acceptResult.error.message ?? "failed to accept like",
        400,
      );
    }

    const accepted = (Array.isArray(acceptResult.data)
      ? acceptResult.data[0]
      : acceptResult.data) as AcceptLikeRow;

    const conversationResult = await supabase
      .from("conversations")
      .select("id, match_id, status")
      .eq("match_id", accepted.match_id)
      .maybeSingle();

    if (conversationResult.error) {
      throw conversationResult.error;
    }

    const conversation = conversationResult.data as ConversationRow | null;
    const route = conversation?.id
      ? chatPushRoute(conversation.id)
      : "/matches";
    let pushResult;

    try {
      const accepterName = await getProfileDisplayName(supabase, user.id);
      pushResult = await createNotificationAndPush(supabase, {
        body: `${accepterName}님과 매칭됐어요. 지금 대화를 시작해 보세요.`,
        data: {
          conversationId: conversation?.id ?? null,
          fromUserId: user.id,
          matchId: accepted.match_id,
          source: "accept-like",
        },
        dedupeKey:
          `match:${accepted.match_id}:accepted:${accepted.counterpart_id}`,
        metadata: {
          conversationId: conversation?.id ?? null,
          fromUserId: user.id,
          likeId,
          matchId: accepted.match_id,
        },
        route,
        title: "좋아요가 수락됐어요",
        type: "match_created",
        userId: accepted.counterpart_id,
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
      conversationId: conversation?.id ?? null,
      counterpartId: accepted.counterpart_id,
      matchId: accepted.match_id,
      push: pushResult,
    });
  } catch (error) {
    const msg = error instanceof Error
      ? error.message
      : "failed to accept like";
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401);
    }
    return errorResponse(msg, 500);
  }
});

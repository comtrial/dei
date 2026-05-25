import { getAuthenticatedUser } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import {
  createNotificationAndPush,
  getProfileDisplayName,
} from "../_shared/push.ts";
import { getKstDateString } from "../_shared/time.ts";

type RequestBody = {
  viewedUserId?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method not allowed", 405);
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const viewedUserId = body.viewedUserId?.trim();

    if (!viewedUserId) {
      return errorResponse("viewedUserId is required", 400);
    }

    if (viewedUserId === user.id) {
      return jsonResponse({ ok: true, skipped: "self" });
    }

    const visibleResult = await supabase.rpc("is_public_profile_visible", {
      p_profile_user_id: viewedUserId,
      p_viewer_user_id: user.id,
    });

    if (visibleResult.error) {
      throw visibleResult.error;
    }

    if (visibleResult.data !== true) {
      return jsonResponse({ ok: true, skipped: "not-visible" });
    }

    const kstDate = getKstDateString();
    const viewerName = await getProfileDisplayName(supabase, user.id);
    const push = await createNotificationAndPush(supabase, {
      body: `${viewerName}님이 프로필을 확인했어요.`,
      data: {
        fromUserId: user.id,
        kstDate,
        notificationType: "profile_viewed",
        source: "record-profile-view",
      },
      dedupeKey: `profile_viewed:${viewedUserId}:${user.id}:${kstDate}`,
      metadata: {
        fromUserId: user.id,
        kstDate,
      },
      route: `/profiles/${user.id}`,
      skipIfDedupeExists: true,
      title: "프로필을 확인한 사람이 있어요",
      type: "profile_viewed",
      userId: viewedUserId,
    });

    return jsonResponse({ ok: true, push });
  } catch (error) {
    const msg = error instanceof Error
      ? error.message
      : "failed to record profile view";
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401);
    }
    return errorResponse(msg, 400);
  }
});

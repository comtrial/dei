import { createAdminClient, isServiceRoleRequest } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { createNotificationAndPush } from "../_shared/push.ts";
import {
  clampLimit,
  getKstDateString,
  parseDateOrNow,
} from "../_shared/time.ts";

type RequestBody = {
  dryRun?: boolean;
  limit?: number;
  now?: string;
};

type DeviceRow = {
  user_id: string;
};

type AccountRow = {
  account_state: string;
  discovery_enabled_at: string | null;
  user_id: string;
};

type ProfileRow = {
  gender: string | null;
  user_id: string;
};

type BlockRow = {
  blocked_user_id: string;
  blocker_user_id: string;
};

type PoolRow = {
  user_id: string;
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1_000;
const TARGET_USER_COUNT = 3;

function uniqueUserIds(rows: DeviceRow[]) {
  return Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
}

async function hasTodayCurationForUser(
  supabase: any,
  userId: string,
  kstDate: string,
) {
  const { data: selfProfile, error: selfError } = await supabase
    .from("profiles")
    .select("user_id, gender")
    .eq("user_id", userId)
    .maybeSingle();

  if (selfError) {
    throw selfError;
  }

  const gender = (selfProfile as ProfileRow | null)?.gender;
  if (gender !== "M" && gender !== "F") {
    return false;
  }

  const targetGender = gender === "M" ? "F" : "M";
  const [blocksResult, oppositeProfilesResult] = await Promise.all([
    supabase
      .from("blocks")
      .select("blocked_user_id, blocker_user_id")
      .is("unblocked_at", null)
      .or(`blocker_user_id.eq.${userId},blocked_user_id.eq.${userId}`),
    supabase
      .from("profiles")
      .select("user_id")
      .eq("gender", targetGender)
      .eq("회원상태", "ACTIVE")
      .eq("차단_YN", "N"),
  ]);

  if (blocksResult.error) throw blocksResult.error;
  if (oppositeProfilesResult.error) throw oppositeProfilesResult.error;

  const blockedSet = new Set<string>();
  for (const row of (blocksResult.data ?? []) as BlockRow[]) {
    blockedSet.add(
      row.blocker_user_id === userId
        ? row.blocked_user_id
        : row.blocker_user_id,
    );
  }

  const allowedUserIds = ((oppositeProfilesResult.data ?? []) as ProfileRow[])
    .map((row) => row.user_id)
    .filter((id) => id !== userId && !blockedSet.has(id));

  if (allowedUserIds.length < TARGET_USER_COUNT) {
    return false;
  }

  const { data, error } = await supabase
    .from("curation_pool")
    .select("user_id")
    .eq("pool_date", kstDate)
    .eq("검수_YN", "Y")
    .eq("차단_YN", "N")
    .in("user_id", allowedUserIds)
    .limit(300);

  if (error) {
    throw error;
  }

  return new Set(((data ?? []) as PoolRow[]).map((row) => row.user_id)).size >=
    TARGET_USER_COUNT;
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
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const now = parseDateOrNow(body.now);
    const kstDate = getKstDateString(now);
    const limit = clampLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const supabase = createAdminClient();

    const devicesResult = await supabase
      .from("user_devices")
      .select("user_id")
      .eq("push_provider", "expo")
      .is("revoked_at", null)
      .not("push_token", "is", null)
      .limit(limit * 3);

    if (devicesResult.error) {
      throw devicesResult.error;
    }

    const userIds = uniqueUserIds((devicesResult.data ?? []) as DeviceRow[])
      .slice(0, limit);

    if (userIds.length === 0) {
      return jsonResponse({
        candidates: 0,
        dryRun: Boolean(body.dryRun),
        ok: true,
        sent: 0,
      });
    }

    const accountsResult = await supabase
      .from("account_status")
      .select("user_id, account_state, discovery_enabled_at")
      .in("user_id", userIds);

    if (accountsResult.error) {
      throw accountsResult.error;
    }

    const eligibleUserIds = ((accountsResult.data ?? []) as AccountRow[])
      .filter((row) =>
        row.account_state === "active" && row.discovery_enabled_at
      )
      .map((row) => row.user_id);
    const curationReadyChecks = await Promise.allSettled(
      eligibleUserIds.map(async (userId) => ({
        ready: await hasTodayCurationForUser(supabase, userId, kstDate),
        userId,
      })),
    );
    const candidates = curationReadyChecks
      .filter((
        result,
      ): result is PromiseFulfilledResult<{ ready: boolean; userId: string }> =>
        result.status === "fulfilled" && result.value.ready
      )
      .map((result) => result.value.userId);
    const checkFailed = curationReadyChecks.filter((result) =>
      result.status === "rejected"
    ).length;

    if (body.dryRun) {
      return jsonResponse({
        candidates: candidates.length,
        checkFailed,
        dryRun: true,
        kstDate,
        ok: true,
        sent: 0,
      });
    }

    const results = await Promise.allSettled(
      candidates.map((userId) =>
        createNotificationAndPush(supabase, {
          body: "오늘의 추천을 확인해보세요.",
          data: {
            kstDate,
            notificationType: "curation_ready",
            source: "send-curation-ready",
          },
          dedupeKey: `curation_ready:${userId}:${kstDate}`,
          metadata: {
            kstDate,
            policy:
              "notify-once-per-kst-day-when-today-curation-has-three-candidates",
          },
          route: "/home",
          skipIfDedupeExists: true,
          title: "새 큐레이션이 도착했어요",
          type: "curation_ready",
          userId,
        })
      ),
    );

    return jsonResponse({
      candidates: candidates.length,
      checkFailed,
      dryRun: false,
      failed: results.filter((result) => result.status === "rejected").length,
      kstDate,
      ok: true,
      sent: results.filter((result) => result.status === "fulfilled").length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "failed to send curation notifications",
      400,
    );
  }
});

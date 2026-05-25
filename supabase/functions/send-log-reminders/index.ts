import { createAdminClient, isServiceRoleRequest } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { createNotificationAndPush } from "../_shared/push.ts";
import {
  clampLimit,
  getKstDateString,
  getKstFourHourSlot,
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

type DailyLogRow = {
  status: string;
  user_id: string;
};

type LogRow = {
  user_id: string;
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2_000;

function uniqueUserIds(rows: DeviceRow[]) {
  return Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
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
    const reminderSlot = getKstFourHourSlot(now);
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

    const [accountsResult, dailyLogsResult, recentLogsResult] = await Promise
      .all([
        supabase
          .from("account_status")
          .select("user_id, account_state, discovery_enabled_at")
          .in("user_id", userIds),
        supabase
          .from("daily_logs")
          .select("user_id, status")
          .eq("log_date", kstDate)
          .in("user_id", userIds),
        supabase
          .from("logs")
          .select("user_id")
          .gte(
            "recorded_at",
            new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
          )
          .in("user_id", userIds),
      ]);

    if (accountsResult.error) throw accountsResult.error;
    if (dailyLogsResult.error) throw dailyLogsResult.error;
    if (recentLogsResult.error) throw recentLogsResult.error;

    const eligibleAccounts = new Set(
      ((accountsResult.data ?? []) as AccountRow[])
        .filter((row) =>
          row.account_state === "active" && row.discovery_enabled_at
        )
        .map((row) => row.user_id),
    );
    const completedUsers = new Set(
      ((dailyLogsResult.data ?? []) as DailyLogRow[])
        .filter((row) => row.status === "COMPLETED")
        .map((row) => row.user_id),
    );
    const recentLogUsers = new Set(
      ((recentLogsResult.data ?? []) as LogRow[]).map((row) => row.user_id),
    );
    const candidates = userIds.filter((userId) =>
      eligibleAccounts.has(userId) &&
      !completedUsers.has(userId) &&
      !recentLogUsers.has(userId)
    );

    if (body.dryRun) {
      return jsonResponse({
        candidates: candidates.length,
        dryRun: true,
        kstDate,
        ok: true,
        reminderSlot,
        sent: 0,
      });
    }

    const results = await Promise.allSettled(
      candidates.map((userId) =>
        createNotificationAndPush(supabase, {
          body: "지금 한 번 기록하면 오늘의 데일리 로그를 이어갈 수 있어요.",
          data: {
            kstDate,
            notificationType: "log_reminder",
            reminderSlot,
            source: "send-log-reminders",
          },
          dedupeKey: `log_reminder:${userId}:${kstDate}:${reminderSlot}`,
          metadata: {
            kstDate,
            policy: "four-hour-window-skip-recent-or-completed",
            reminderSlot,
          },
          route: "/record",
          skipIfDedupeExists: true,
          title: "오늘 로그를 남겨볼까요?",
          type: "log_reminder",
          userId,
        })
      ),
    );

    return jsonResponse({
      candidates: candidates.length,
      dryRun: false,
      failed: results.filter((result) => result.status === "rejected").length,
      kstDate,
      ok: true,
      reminderSlot,
      sent: results.filter((result) => result.status === "fulfilled").length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "failed to send log reminders",
      400,
    );
  }
});

// ROOMS-CRON · POST /functions/v1/notify-rematch-available
//
// 방 이탈 후 24h cooldown 이 막 끝난 사용자에게 "다시 매칭할 수 있어요" 알림.
// cooldown 가 만료된 시점 ± 15분 window 안에 들어온 사용자만 (cron 빈도와 매치).
//
// Cron: 15분마다.
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createNotificationAndPush } from '../_shared/push.ts';
import { clampLimit, parseDateOrNow } from '../_shared/time.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1500;

type Body = { dryRun?: boolean; now?: string; limit?: number };
type Row = { profile_id: string; cooldown_until: string };
type ProfileRow = {
  user_id: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
};

function isQuietHour(hour: number, start: number, end: number) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  if (!isServiceRoleRequest(req)) return errorResponse('unauthorized', 401);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const now = parseDateOrNow(body.now);
    const kstHour = new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
    const limit = clampLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const dryRun = body.dryRun === true;
    const admin = createAdminClient();

    const lower = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const upper = now.toISOString();

    const cooldownRes = await admin
      .from('room_leave_cooldowns')
      .select('profile_id, cooldown_until')
      .gte('cooldown_until', lower)
      .lt('cooldown_until', upper)
      .limit(limit);

    if (cooldownRes.error) throw cooldownRes.error;
    const rows = (cooldownRes.data ?? []) as Row[];
    if (rows.length === 0) {
      return jsonResponse({ processed: 0, eligible: 0, sent: 0, dryRun });
    }

    const userIds = rows.map((r) => r.profile_id);

    const profileRes = await admin
      .from('profiles')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds);

    const allowedSet = new Set(
      ((profileRes.data ?? []) as ProfileRow[])
        .filter((p) => !isQuietHour(kstHour, p.quiet_hours_start, p.quiet_hours_end))
        .map((p) => p.user_id),
    );

    const eligible = rows.filter((r) => allowedSet.has(r.profile_id));

    if (dryRun || eligible.length === 0) {
      return jsonResponse({
        processed: rows.length,
        eligible: eligible.length,
        sent: 0,
        dryRun,
      });
    }

    let sent = 0;
    await Promise.allSettled(
      eligible.map(async (row) => {
        const dedupeKey = `rematch-avail:${row.profile_id}:${row.cooldown_until.slice(0, 13)}`;
        try {
          await createNotificationAndPush(admin, {
            userId: row.profile_id,
            type: 'rematch_available',
            title: '다시 만날 준비가 됐어요',
            body: '재매칭 제한이 풀렸어요. 새로운 방을 찾아볼까요?',
            route: '/home',
            data: { kind: 'rematch_available' },
            dedupeKey,
            skipIfDedupeExists: true,
          });
          sent += 1;
        } catch {
          /* swallow */
        }
      }),
    );

    return jsonResponse({
      processed: rows.length,
      eligible: eligible.length,
      sent,
      dryRun: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

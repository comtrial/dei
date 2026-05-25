// ROOMS-CRON · POST /functions/v1/notify-blur-gate-reapply
//
// 내 마지막 영상이 23시간 이상 경과(곧 블러 재적용)한 active 방 멤버에게
// 경고 push. 24시간 지난 후엔 자동으로 블러가 재적용되므로, 그 직전에 한 번
// 만 알려준다 (dedupe: `blur-reapply:<userId>:<roomId>:<roundedHour>`).
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
type Row = {
  profile_id: string;
  room_id: string;
  uploaded_at: string;
};
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

    // 23~24h 이전에 마지막 영상이 있는 (profile, room)
    const upper = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    const lower = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 최근 업로드 1건만 가져오기 위해 RPC 가 이상적이지만 단순화: per-room
    // 가장 최근 영상이 23~24h window 안인지 확인 — distinct (profile, room)
    // 별 최신 1건 추출 (active 방 한정).
    const recentRes = await admin
      .from('hourly_uploads')
      .select('profile_id, room_id, uploaded_at, rooms!inner(status)')
      .eq('rooms.status', 'active')
      .gte('uploaded_at', lower)
      .lt('uploaded_at', upper)
      .order('uploaded_at', { ascending: false })
      .limit(limit * 3);

    if (recentRes.error) throw recentRes.error;

    // (profile, room) 별 최신 row 만 남김
    const byPair = new Map<string, Row>();
    for (const r of (recentRes.data ?? []) as Row[]) {
      const key = `${r.profile_id}:${r.room_id}`;
      if (!byPair.has(key)) byPair.set(key, r);
    }
    const candidates = Array.from(byPair.values()).slice(0, limit);

    if (candidates.length === 0) {
      return jsonResponse({ processed: 0, eligible: 0, sent: 0, dryRun });
    }

    // 그 동안 더 최근의 업로드가 있다면 제외 (race 가드)
    const userIds = candidates.map((c) => c.profile_id);
    const newerRes = await admin
      .from('hourly_uploads')
      .select('profile_id, room_id, uploaded_at')
      .in('profile_id', userIds)
      .gt('uploaded_at', upper);

    const newerKey = new Set(
      ((newerRes.data ?? []) as { profile_id: string; room_id: string }[]).map(
        (u) => `${u.profile_id}:${u.room_id}`,
      ),
    );
    const filtered = candidates.filter((c) => !newerKey.has(`${c.profile_id}:${c.room_id}`));

    // quiet hours
    const profileRes = await admin
      .from('profiles')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds);

    const allowedSet = new Set(
      ((profileRes.data ?? []) as ProfileRow[])
        .filter((p) => !isQuietHour(kstHour, p.quiet_hours_start, p.quiet_hours_end))
        .map((p) => p.user_id),
    );

    const eligible = filtered.filter((c) => allowedSet.has(c.profile_id));

    if (dryRun || eligible.length === 0) {
      return jsonResponse({
        processed: candidates.length,
        eligible: eligible.length,
        sent: 0,
        dryRun,
      });
    }

    let sent = 0;
    await Promise.allSettled(
      eligible.map(async (row) => {
        // dedupe key 는 "마지막 영상의 24h 윈도우" 단위
        const dedupeKey = `blur-reapply:${row.profile_id}:${row.room_id}:${row.uploaded_at.slice(0, 13)}`;
        try {
          await createNotificationAndPush(admin, {
            userId: row.profile_id,
            type: 'blur_gate_reapplied',
            title: '곧 친구들 일상이 다시 안 보여요',
            body: '24시간이 지나면 블러가 다시 적용돼요. 3초만 남겨주세요.',
            route: `/room/${row.room_id}/upload`,
            data: { roomId: row.room_id, kind: 'blur_reapply' },
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
      processed: candidates.length,
      eligible: eligible.length,
      sent,
      dryRun: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

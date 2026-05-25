// ROOMS-CRON · POST /functions/v1/notify-blur-gate-remind
//
// 방에 들어온 지 30~60분 사이인데 아직 첫 영상을 안 올린 멤버에게 "첫 영상
// 올리고 친구들의 일상 보기" 리마인드 push. dedupe 로 1회만.
//
// Cron: 15분마다 (`*/15 * * * *`).
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createNotificationAndPush } from '../_shared/push.ts';
import { clampLimit, parseDateOrNow } from '../_shared/time.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

type Body = { dryRun?: boolean; now?: string; limit?: number };
type Row = { profile_id: string; room_id: string; joined_at: string };
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

    // 30분~60분 사이 join, status='active', 방도 active
    const lower = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const upper = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const memberRes = await admin
      .from('room_members')
      .select('profile_id, room_id, joined_at, rooms!inner(status)')
      .eq('status', 'active')
      .eq('rooms.status', 'active')
      .gte('joined_at', lower)
      .lt('joined_at', upper)
      .limit(limit);

    if (memberRes.error) throw memberRes.error;
    const rows = (memberRes.data ?? []) as Row[];

    // 첫 영상이 있는 멤버는 제외
    const uploadedRes = await admin
      .from('hourly_uploads')
      .select('profile_id, room_id')
      .in('profile_id', rows.map((r) => r.profile_id))
      .in('room_id', rows.map((r) => r.room_id));

    const hasUploadKey = new Set(
      ((uploadedRes.data ?? []) as { profile_id: string; room_id: string }[]).map(
        (u) => `${u.profile_id}:${u.room_id}`,
      ),
    );

    const candidates = rows.filter((r) => !hasUploadKey.has(`${r.profile_id}:${r.room_id}`));

    if (candidates.length === 0) {
      return jsonResponse({ processed: rows.length, eligible: 0, sent: 0, dryRun });
    }

    // quiet hours
    const userIds = candidates.map((c) => c.profile_id);
    const profileRes = await admin
      .from('profiles')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds);

    const allowedSet = new Set(
      ((profileRes.data ?? []) as ProfileRow[])
        .filter((p) => !isQuietHour(kstHour, p.quiet_hours_start, p.quiet_hours_end))
        .map((p) => p.user_id),
    );

    const eligible = candidates.filter((c) => allowedSet.has(c.profile_id));

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
        const dedupeKey = `blur-remind:${row.profile_id}:${row.room_id}`;
        try {
          await createNotificationAndPush(admin, {
            userId: row.profile_id,
            type: 'blur_gate_reminder',
            title: '친구들 일상이 궁금하지 않으세요?',
            body: '3초 영상 하나면 방 친구들의 하루가 모두 열려요.',
            route: `/room/${row.room_id}/upload`,
            data: { roomId: row.room_id, kind: 'blur_remind' },
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

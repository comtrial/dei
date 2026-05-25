// ROOMS-CRON · POST /functions/v1/notify-hourly-upload
//
// 매시간 정각(또는 cron 실행 시점)에 활성 방의 active 멤버에게 "영상 올릴 시간"
// push 알림을 보낸다. D3 quiet hours (profiles.quiet_hours_start/end) 적용.
//
// Cron: 매시간 (`0 * * * *`) 트리거. dedupe key 로 시간별 1회만 발송.
//
// 입력 (JSON body, optional):
//   dryRun?: boolean    — true 면 push 발송 없이 대상자 수만 리포트
//   now?:    string     — 테스트용 가상 시각 (ISO)
//   limit?:  number     — 단일 실행 처리 상한 (default 500, max 2000)
//
// 응답:
//   200 { processed, sent, skipped, dryRun }
//   401 { error }
//   500 { error }
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createNotificationAndPush } from '../_shared/push.ts';
import { clampLimit, getKstDateString, parseDateOrNow } from '../_shared/time.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

type Body = { dryRun?: boolean; now?: string; limit?: number };
type RoomMember = { profile_id: string; room_id: string };
type ProfileRow = {
  user_id: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
};

function isQuietHour(hour: number, start: number, end: number) {
  // start ≤ end (e.g. 0..7): hour in [start, end) → quiet
  // start > end  (e.g. 22..7): wraps midnight
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
    const kstDate = getKstDateString(now);
    const limit = clampLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const dryRun = body.dryRun === true;

    const admin = createAdminClient();

    // 1) 활성 방의 active 멤버 ID 수집
    const memberRes = await admin
      .from('room_members')
      .select('profile_id, room_id, rooms!inner(status)')
      .eq('status', 'active')
      .eq('rooms.status', 'active')
      .limit(limit * 3);

    if (memberRes.error) throw memberRes.error;

    const memberMap = new Map<string, string>();  // profileId -> roomId (한 사용자 first room)
    for (const row of (memberRes.data ?? []) as RoomMember[]) {
      if (!memberMap.has(row.profile_id)) {
        memberMap.set(row.profile_id, row.room_id);
      }
    }

    const userIds = Array.from(memberMap.keys()).slice(0, limit);
    if (userIds.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, skipped: 0, dryRun });
    }

    // 2) quiet hours 필터링
    const profileRes = await admin
      .from('profiles')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds);

    if (profileRes.error) throw profileRes.error;

    const profiles = (profileRes.data ?? []) as ProfileRow[];
    const eligibleUserIds = profiles
      .filter((p) => !isQuietHour(kstHour, p.quiet_hours_start, p.quiet_hours_end))
      .map((p) => p.user_id);

    if (eligibleUserIds.length === 0) {
      return jsonResponse({
        processed: userIds.length,
        sent: 0,
        skipped: userIds.length,
        dryRun,
      });
    }

    if (dryRun) {
      return jsonResponse({
        processed: userIds.length,
        sent: 0,
        eligible: eligibleUserIds.length,
        skipped: userIds.length - eligibleUserIds.length,
        dryRun: true,
      });
    }

    // 3) push 발송 (dedupe key 로 시간별 1회만)
    let sent = 0;
    let failed = 0;
    await Promise.allSettled(
      eligibleUserIds.map(async (userId) => {
        const roomId = memberMap.get(userId)!;
        const dedupeKey = `hourly:${userId}:${kstDate}:${kstHour}`;
        try {
          const result = await createNotificationAndPush(admin, {
            userId,
            type: 'hourly_upload_reminder',
            title: '지금 이 순간을 남겨보세요',
            body: '방 친구들에게 보여줄 3초 영상을 올릴 시간이에요.',
            route: `/room/${roomId}/upload`,
            data: { roomId, kind: 'hourly_upload' },
            dedupeKey,
            skipIfDedupeExists: true,
          });
          if (result && (result as { sent?: number }).sent && (result as { sent: number }).sent > 0) {
            sent += 1;
          }
        } catch {
          failed += 1;
        }
      }),
    );

    return jsonResponse({
      processed: userIds.length,
      eligible: eligibleUserIds.length,
      sent,
      failed,
      skipped: userIds.length - eligibleUserIds.length,
      dryRun: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

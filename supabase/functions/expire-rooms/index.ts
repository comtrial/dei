// ROOMS-CRON · POST /functions/v1/expire-rooms
//
// `expires_at < now()` 인 active 방을 ended 처리. 멤버의 hourly_uploads 는
// archived_at 으로 마킹 (영상 storage 는 30일 후 별도 purge — `purge-expired-uploads`).
// profiles.is_in_active_room 캐시 동기화.
//
// Cron: 매시간 (`0 * * * *`).
//
// 입력 (JSON body, optional):
//   dryRun?: boolean
//   now?:    string
//   limit?:  number    — 한 번에 처리할 방 수 (default 200, max 1000)
//
// 응답:
//   200 { processed, ended, dryRun }
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { clampLimit, parseDateOrNow } from '../_shared/time.ts';

type Body = { dryRun?: boolean; now?: string; limit?: number };
type Room = { id: string };
type MemberRow = { profile_id: string };

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  if (!isServiceRoleRequest(req)) return errorResponse('unauthorized', 401);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const now = parseDateOrNow(body.now);
    const limit = clampLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const dryRun = body.dryRun === true;
    const admin = createAdminClient();

    const candidatesRes = await admin
      .from('rooms')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', now.toISOString())
      .limit(limit);

    if (candidatesRes.error) throw candidatesRes.error;

    const rooms = (candidatesRes.data ?? []) as Room[];
    if (rooms.length === 0) {
      return jsonResponse({ processed: 0, ended: 0, dryRun });
    }

    if (dryRun) {
      return jsonResponse({
        processed: rooms.length,
        ended: 0,
        roomIds: rooms.map((r) => r.id),
        dryRun: true,
      });
    }

    let ended = 0;
    for (const room of rooms) {
      // 트랜잭션 단위 처리 — 각 방마다 순차로
      const updateRoom = await admin
        .from('rooms')
        .update({
          status: 'ended',
          ended_at: now.toISOString(),
          ended_reason: 'expired',
          active_member_count: 0,
        })
        .eq('id', room.id)
        .eq('status', 'active');  // race 가드

      if (updateRoom.error) continue;

      // 멤버 status='left' 일괄
      await admin
        .from('room_members')
        .update({ status: 'left', left_at: now.toISOString() })
        .eq('room_id', room.id)
        .eq('status', 'active');

      // 영상 archive
      await admin
        .from('hourly_uploads')
        .update({ archived_at: now.toISOString() })
        .eq('room_id', room.id)
        .is('archived_at', null);

      // 영향 멤버들의 is_in_active_room 캐시 재계산
      const memberRes = await admin
        .from('room_members')
        .select('profile_id')
        .eq('room_id', room.id);

      if (!memberRes.error && memberRes.data) {
        for (const m of memberRes.data as MemberRow[]) {
          const otherActive = await admin
            .from('room_members')
            .select('room_id')
            .eq('profile_id', m.profile_id)
            .eq('status', 'active')
            .limit(1);

          if (!otherActive.error && (otherActive.data ?? []).length === 0) {
            await admin
              .from('profiles')
              .update({ is_in_active_room: false })
              .eq('user_id', m.profile_id);
          }
        }
      }

      ended += 1;
    }

    return jsonResponse({ processed: rooms.length, ended, dryRun: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

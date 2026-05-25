// ROOMS-API · POST /functions/v1/match-admin-create-room  (운영진 전용)
//
// 후보 묶음들(매칭 큐에서 선택)로 새 방을 편성. service_role 키로만 호출 가능
// (RLS 우회). 운영진 도구 / Supabase Studio / 어드민 페이지에서 사용.
//
// 입력 (JSON body):
//   groupIds: uuid[]
//
// 응답:
//   200 { roomId: uuid, notified: number }
//   401 { error }
//   400 { error }
//   500 { error }
//
// RPC: public.admin_create_room
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createNotificationAndPush } from '../_shared/push.ts';

type Body = { groupIds?: unknown };
type MemberRow = { profile_id: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  if (!isServiceRoleRequest(req)) return errorResponse('unauthorized', 401);

  try {
    const admin = createAdminClient();

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400);
    }

    const rawIds = Array.isArray(body.groupIds) ? body.groupIds : null;
    if (!rawIds || rawIds.length === 0) {
      return errorResponse('groupIds is required and must be a non-empty array', 400);
    }
    const groupIds = rawIds.filter((g): g is string => typeof g === 'string');
    if (groupIds.length === 0) {
      return errorResponse('groupIds must contain string uuids', 400);
    }

    const { data: roomId, error } = await admin.rpc('admin_create_room', {
      p_group_ids: groupIds,
    });

    if (error) {
      if (error.code === '22023') return errorResponse(error.message, 400);
      throw error;
    }

    // 매칭 완료 push — 신규 방 멤버 전원
    const members = await admin
      .from('room_members')
      .select('profile_id')
      .eq('room_id', roomId);

    let notified = 0;
    if (!members.error && members.data) {
      await Promise.allSettled(
        (members.data as MemberRow[]).map(async (m) => {
          try {
            await createNotificationAndPush(admin, {
              userId: m.profile_id,
              type: 'room_matched',
              title: '새로운 방이 열렸어요',
              body: '같은 시간을 공유할 사람들이 도착했어요. 3초 영상을 올리고 들어가보세요.',
              route: `/room/${roomId}`,
              data: { roomId, kind: 'room_matched' },
              dedupeKey: `room-matched:${roomId}:${m.profile_id}`,
              skipIfDedupeExists: true,
            });
            notified += 1;
          } catch {
            /* swallow per-user */
          }
        }),
      );
    }

    return jsonResponse({ roomId, notified });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

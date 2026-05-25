// ROOMS-API · POST /functions/v1/room-leave
//
// 방 이탈. 본인을 room_members.status='left' 로 갱신하고 24h cooldown 을 설정.
// 마지막 멤버가 떠나면 방을 `ended` 처리한다 (RPC 내부 처리).
//
// 입력 (JSON body):
//   roomId: uuid
//
// 응답:
//   200 { ok: true }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   500 { error, retryable:true }
//
// RPC: public.leave_room
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = { roomId?: unknown };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser } = await getAuthenticatedUser(req);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }
    const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) {
      return errorResponse('roomId is required', 400, { retryable: false });
    }

    const { error } = await supabaseAsUser.rpc('leave_room', {
      p_room_id: roomId,
    });

    if (error) {
      if (error.code === '42501') {
        return errorResponse('authentication required', 401, { retryable: false });
      }
      throw error;
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});

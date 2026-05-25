// ROOMS-API · POST /functions/v1/room-block-user
//
// 사용자 차단 (영구, D5). 방 컨텍스트가 주어지면 자동 퇴장 임계값(D9) 도 체크.
//
// 입력 (JSON body):
//   blockedId:     uuid
//   sourceRoomId:  uuid | null   — 방 컨텍스트 (없으면 단순 차단)
//   reason:        string | null
//
// 응답:
//   200 { ok: true }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   500 { error, retryable:true }
//
// RPC: public.block_user
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = {
  blockedId?: unknown;
  sourceRoomId?: unknown;
  reason?: unknown;
};

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
    const blockedId = typeof body.blockedId === 'string' ? body.blockedId.trim() : '';
    const sourceRoomId =
      typeof body.sourceRoomId === 'string' && body.sourceRoomId.trim().length > 0
        ? body.sourceRoomId.trim()
        : null;
    const reason =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : null;

    if (!blockedId) {
      return errorResponse('blockedId is required', 400, { retryable: false });
    }

    const { error } = await supabaseAsUser.rpc('block_user', {
      p_blocked_id: blockedId,
      p_source_room_id: sourceRoomId,
      p_reason: reason,
    });

    if (error) {
      if (error.code === '22023') {
        return errorResponse(error.message, 400, { retryable: false });
      }
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

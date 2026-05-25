// ROOMS-API · POST /functions/v1/match-enqueue
//
// 묶음을 매칭 큐에 적재. D4 가용성 (모든 멤버가 다른 active 방에 들어있지 않음)
// 을 RPC 가 검증.
//
// 입력 (JSON body):
//   groupId: uuid
//
// 응답:
//   200 { queueId: uuid }
//   400 { error, retryable:false }            잘못된 group/state
//   401 { error, retryable:false }
//   409 { error, retryable:false }            멤버가 다른 방에서 사용 중
//   500 { error, retryable:true }
//
// RPC: public.enqueue_group_for_match(p_group_id uuid)
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = { groupId?: unknown };

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
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
    if (!groupId) {
      return errorResponse('groupId is required', 400, { retryable: false });
    }

    const { data, error } = await supabaseAsUser.rpc('enqueue_group_for_match', {
      p_group_id: groupId,
    });

    if (error) {
      if (error.code === 'P0001') {
        return errorResponse(error.message, 409, { retryable: false });
      }
      if (error.code === 'P0002') {
        return errorResponse(error.message, 404, { retryable: false });
      }
      if (error.code === '22023') {
        return errorResponse(error.message, 400, { retryable: false });
      }
      if (error.code === '42501') {
        return errorResponse('authentication required', 401, { retryable: false });
      }
      throw error;
    }

    return jsonResponse({ queueId: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});

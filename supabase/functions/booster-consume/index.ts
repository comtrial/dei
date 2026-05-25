// ROOMS-API · POST /functions/v1/booster-consume
//
// 사용 가능한 부스터 grant 1건을 소비하고 24h cooldown 을 제거한다.
//
// 입력 (JSON body): {}  (현재 사용자 컨텍스트만)
//
// 응답:
//   200 { grantId: uuid }
//   401 { error, retryable:false }
//   404 { error, retryable:false }            no available grant
//   500 { error, retryable:true }
//
// RPC: public.consume_booster_grant
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser } = await getAuthenticatedUser(req);

    const { data, error } = await supabaseAsUser.rpc('consume_booster_grant');

    if (error) {
      if (error.code === 'P0002') {
        return errorResponse('no available booster grant', 404, { retryable: false });
      }
      if (error.code === '42501') {
        return errorResponse('authentication required', 401, { retryable: false });
      }
      throw error;
    }

    return jsonResponse({ grantId: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});

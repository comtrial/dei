// ROOMS-API · POST /functions/v1/booster-grant-free-female
//
// 여성 사용자이고 24h cooldown 이 있을 때 무료 부스터 grant 1건 발급.
// (D11) — 클라가 BoosterPurchaseSheet 진입 시 자동 호출 후 consume 흐름.
//
// 응답:
//   200 { grantId: uuid }
//   400 { error }                    cooldown 없음 또는 성별 불일치
//   401 { error }
//   500 { error }
//
// RPC: public.grant_free_booster_for_female
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser } = await getAuthenticatedUser(req);

    const { data, error } = await supabaseAsUser.rpc('grant_free_booster_for_female');

    if (error) {
      if (error.code === 'P0002') {
        return errorResponse('no active cooldown', 400, { retryable: false });
      }
      if (error.code === '42501') {
        const msg =
          error.message?.includes('female')
            ? 'not eligible (female only)'
            : 'authentication required';
        return errorResponse(msg, msg === 'authentication required' ? 401 : 403, {
          retryable: false,
        });
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

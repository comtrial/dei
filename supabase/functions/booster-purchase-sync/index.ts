// ROOMS-API · POST /functions/v1/booster-purchase-sync
//
// RevenueCat 영수증을 동기화하여 `booster_grants` 에 row 를 적재한다.
// 패턴은 기존 `sync-refresh-purchase` 의 부스터 전용 변형.
// 환불은 RevenueCat webhook (`revenuecat-webhook`) 이 처리.
//
// 입력 (JSON body):
//   productId:     'booster_instant_rematch_v1'
//   transactionId: string (RevenueCat 트랜잭션 ID, unique)
//
// 응답:
//   200 { grantId: uuid, alreadyExists?: boolean }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   500 { error, retryable:true }
import { createAdminClient, getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = {
  productId?: unknown;
  transactionId?: unknown;
};

const ALLOWED_PRODUCT_IDS = new Set(['booster_instant_rematch_v1']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { user } = await getAuthenticatedUser(req);
    const admin = createAdminClient();

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }

    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const transactionId =
      typeof body.transactionId === 'string' ? body.transactionId.trim() : '';

    if (!ALLOWED_PRODUCT_IDS.has(productId)) {
      return errorResponse('invalid productId', 400, { retryable: false });
    }
    if (!transactionId) {
      return errorResponse('transactionId is required', 400, { retryable: false });
    }

    // 동일 transaction 이미 있으면 그것 반환 (idempotent)
    const existing = await admin
      .from('booster_grants')
      .select('id')
      .eq('revenuecat_transaction_id', transactionId)
      .maybeSingle();

    if (existing.error && existing.error.code !== 'PGRST116') {
      throw existing.error;
    }
    if (existing.data?.id) {
      return jsonResponse({ grantId: existing.data.id, alreadyExists: true });
    }

    const inserted = await admin
      .from('booster_grants')
      .insert({
        profile_id: user.id,
        source: 'purchase',
        product_id: productId,
        revenuecat_transaction_id: transactionId,
      })
      .select('id')
      .single();

    if (inserted.error) {
      throw inserted.error;
    }

    return jsonResponse({ grantId: inserted.data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});

import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  findRevenueCatNonSubscription,
  getPaymentAmount,
  getRequiredEnv,
  getRefreshProductId,
  isHeartProduct,
  type RevenueCatSubscriberResponse,
} from '../_shared/revenuecat.ts';

type SyncRefreshPurchaseBody = {
  currency?: string;
  offeringId?: string;
  packageId?: string;
  priceAmount?: number;
  productId?: string;
  purchaseDate?: string | null;
  transactionId?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    const body = await req.json() as SyncRefreshPurchaseBody;
    const productId = body.productId?.trim() || getRefreshProductId();
    const isHeart = isHeartProduct(productId);
    const transactionId = body.transactionId?.trim();

    if (!transactionId) {
      return errorResponse('transactionId is required');
    }

    const apiSecret = getRequiredEnv('REVENUECAT_SECRET_KEY');
    const subscriberResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiSecret}`,
        },
      },
    );
    const subscriberBody = await subscriberResponse.json() as RevenueCatSubscriberResponse & {
      message?: string;
    };

    if (!subscriberResponse.ok) {
      return errorResponse(subscriberBody.message ?? 'RevenueCat subscriber lookup failed', 502);
    }

    const purchase = findRevenueCatNonSubscription(subscriberBody, productId, transactionId);

    if (!purchase) {
      return errorResponse('matching RevenueCat non-subscription purchase was not found', 402);
    }

    const resolvedTransactionId = purchase.id
      ?? purchase.transaction_id
      ?? purchase.store_transaction_id
      ?? transactionId;

    const existingPayment = await supabase
      .from('payments')
      .select('id')
      .eq('provider', 'revenuecat')
      .eq('revenuecat_transaction_id', resolvedTransactionId)
      .maybeSingle();

    if (existingPayment.error) {
      throw existingPayment.error;
    }

    const paymentPayload = {
      amount: getPaymentAmount(body.priceAmount),
      currency: body.currency ?? 'KRW',
      environment: purchase.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
      external_tx_id: resolvedTransactionId,
      offering_id: body.offeringId ?? null,
      package_id: body.packageId ?? null,
      payment_method: 'IAP',
      product_id: productId,
      product_type: isHeart ? 'HEART' : 'REFRESH',
      provider: 'revenuecat',
      purchased_at: purchase.purchase_date ?? body.purchaseDate ?? new Date().toISOString(),
      raw_payload: {
        purchase,
        source: 'sync-refresh-purchase',
      },
      revenuecat_app_user_id: user.id,
      revenuecat_original_app_user_id: subscriberBody.subscriber?.original_app_user_id ?? null,
      revenuecat_transaction_id: resolvedTransactionId,
      store: purchase.store ?? null,
      user_id: user.id,
      '결제상태': 'SUCCESS',
    };

    const paymentResult = existingPayment.data
      ? await supabase
        .from('payments')
        .update(paymentPayload)
        .eq('id', existingPayment.data.id)
        .select('id')
        .single()
      : await supabase
        .from('payments')
        .insert(paymentPayload)
        .select('id')
        .single();

    if (paymentResult.error) {
      throw paymentResult.error;
    }

    const grantResult = await supabase.rpc('grant_refresh_item', {
      p_granted_count: 1,
      p_payment_id: paymentResult.data.id,
      p_product_id: productId,
      p_user_id: user.id,
    });

    if (grantResult.error) {
      throw grantResult.error;
    }

    const notificationResult = await supabase.rpc('create_notification', {
      p_body: isHeart
        ? '결제 성공 후 하트 1개가 충전됐어요.'
        : '결제 성공 후 신규 3명 매칭 이용권이 충전됐어요.',
      p_dedupe_key: `payment:${paymentResult.data.id}:success`,
      p_metadata: {
        paymentId: paymentResult.data.id,
        productId,
        refreshGrantId: grantResult.data?.id ?? null,
        source: 'sync-refresh-purchase',
      },
      p_route: '/home',
      p_title: isHeart ? '하트가 충전됐어요' : '매칭 이용권이 충전됐어요',
      p_type: 'payment_succeeded',
      p_user_id: user.id,
    });

    if (notificationResult.error) {
      throw notificationResult.error;
    }

    const refreshCountResult = await supabase.rpc('get_available_refresh_item_count', {
      p_user_id: user.id,
    });
    const heartCountResult = await supabase.rpc('get_available_heart_count', {
      p_user_id: user.id,
    });

    if (refreshCountResult.error) {
      throw refreshCountResult.error;
    }
    if (heartCountResult.error) {
      throw heartCountResult.error;
    }

    return jsonResponse({
      availableHeartCount: heartCountResult.data ?? 0,
      availableRefreshCount: refreshCountResult.data ?? 0,
      paymentId: paymentResult.data.id,
      refreshGrantId: grantResult.data?.id,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'failed to sync refresh purchase',
      400,
    );
  }
});

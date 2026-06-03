import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError } from '../_shared/log.ts';
import {
  getInstantRematchProduct,
  getRequiredPaymentEnv,
} from '../_shared/instant-rematch-payment.ts';

type StartPaymentBody = {
  productId?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  let userId: string | undefined;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as StartPaymentBody;
    const productId = typeof body.productId === 'string' ? body.productId : null;
    const product = getInstantRematchProduct(productId);
    const storeId = getRequiredPaymentEnv('PORTONE_STORE_ID');
    const channelKey = getRequiredPaymentEnv('PORTONE_PAYMENT_CHANNEL_KEY');
    const paymentId = crypto.randomUUID();

    const { error: insertError } = await supabase.from('payment').insert({
      amount: product.amount,
      id: paymentId,
      product_id: product.id,
      provider: 'portone',
      status: 'pending',
      user_id: user.id,
    });

    if (insertError) {
      throw insertError;
    }

    return jsonResponse({
      request: {
        appScheme: 'dei',
        channelKey,
        currency: 'KRW',
        customData: {
          productId: product.id,
          source: 'mobile',
          userId: user.id,
        },
        orderName: product.label,
        payMethod: 'CARD',
        paymentId,
        productType: 'DIGITAL',
        products: [
          {
            amount: product.amount,
            id: product.id,
            name: product.label,
            quantity: 1,
          },
        ],
        storeId,
        totalAmount: product.amount,
      },
    });
  } catch (error) {
    // env 누락(PORTONE_INSTANT_REMATCH_AMOUNT_* misconfig) 은 전 구매를 막는데
    // 지금까지 완전히 invisible 했다. payment 행 insert throw 도 여기서 잡힌다.
    captureEdgeError('start-instant-rematch-payment', error, {
      stage: 'start_payment',
      status: 500,
      userId,
      tags: { feature: 'payment', code: 'start_failed' },
    });
    const message = error instanceof Error ? error.message : 'failed to start payment';
    return errorResponse(message, 400);
  }
});

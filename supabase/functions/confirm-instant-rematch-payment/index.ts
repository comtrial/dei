import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError, captureEdgeMessage } from '../_shared/log.ts';
import {
  getInstantRematchProduct,
  getRequiredPaymentEnv,
} from '../_shared/instant-rematch-payment.ts';

type ConfirmPaymentBody = {
  code?: unknown;
  message?: unknown;
  paymentId?: unknown;
  productId?: unknown;
  txId?: unknown;
};

type PortOnePayment = {
  amount?: number | { total?: number };
  id?: string;
  paidAt?: string;
  paymentId?: string;
  status?: string;
  totalAmount?: number;
};

const getPaymentAmount = (payment: PortOnePayment) => {
  if (typeof payment.totalAmount === 'number') {
    return payment.totalAmount;
  }

  if (typeof payment.amount === 'number') {
    return payment.amount;
  }

  if (payment.amount && typeof payment.amount === 'object') {
    return typeof payment.amount.total === 'number' ? payment.amount.total : null;
  }

  return null;
};

const isPaid = (payment: PortOnePayment) => {
  const status = payment.status?.toUpperCase();
  return status === 'PAID' || status === 'DONE' || status === 'COMPLETED' || Boolean(payment.paidAt);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  // catch 에서 식별자를 잃지 않도록 hoist(user/product 는 try 내부 선언).
  let userId: string | undefined;
  let capturedPaymentId: string | undefined;
  let capturedProductId: string | undefined;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as ConfirmPaymentBody;
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
    const productId = typeof body.productId === 'string' ? body.productId.trim() : null;
    const sdkCode = typeof body.code === 'string' ? body.code.trim() : null;
    const sdkMessage = typeof body.message === 'string' ? body.message.trim() : null;
    const product = getInstantRematchProduct(productId);
    capturedPaymentId = paymentId || undefined;
    capturedProductId = product.id;

    if (!paymentId) {
      return errorResponse('paymentId is required', 400);
    }

    if (sdkCode) {
      await supabase
        .from('payment')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .eq('user_id', user.id);

      return errorResponse(sdkMessage || 'payment failed', 400, { code: sdkCode });
    }

    const storeId = getRequiredPaymentEnv('PORTONE_STORE_ID');
    const apiSecret = getRequiredPaymentEnv('PORTONE_API_SECRET');
    const portOneResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `PortOne ${apiSecret}`,
        },
      },
    );
    const portOneBody = await portOneResponse.json().catch(() => ({}));

    if (!portOneResponse.ok) {
      await supabase
        .from('payment')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .eq('user_id', user.id);

      // PortOne 인프라 장애 — 사용자 결제 검증 자체가 불가. 사용자 잘못 아님.
      captureEdgeMessage('confirm-instant-rematch-payment', 'PortOne payment lookup failed', {
        stage: 'fetch_portone',
        status: 502,
        level: 'warning',
        userId: user.id,
        tags: { feature: 'payment' },
        extra: { paymentId, portoneStatus: portOneResponse.status },
      });

      return errorResponse(portOneBody?.message ?? 'PortOne payment lookup failed', 502);
    }

    const payment = (portOneBody.payment ?? portOneBody) as PortOnePayment;
    const amount = getPaymentAmount(payment);

    if (!isPaid(payment) || amount !== product.amount) {
      await supabase
        .from('payment')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .eq('user_id', user.id);

      // 결제 미완 또는 금액 불일치 — 정합성/위변조 reconciliation 신호로 기록.
      captureEdgeMessage('confirm-instant-rematch-payment', 'payment_verification_mismatch', {
        stage: 'verify_payment',
        status: 400,
        level: 'warning',
        userId: user.id,
        tags: { feature: 'payment', code: 'payment_verification_mismatch' },
        extra: {
          paymentId,
          paymentStatus: payment.status ?? null,
          expectedAmount: product.amount,
          gotAmount: amount,
        },
      });

      return errorResponse('payment verification failed', 400, {
        paymentStatus: payment.status ?? null,
      });
    }

    const { error: paymentUpdateError } = await supabase
      .from('payment')
      .update({
        amount: product.amount,
        product_id: product.id,
        provider: 'portone',
        status: 'completed',
      })
      .eq('id', paymentId)
      .eq('user_id', user.id);

    if (paymentUpdateError) {
      throw paymentUpdateError;
    }

    const { data: existingPass, error: passLoadError } = await supabase
      .from('pass')
      .select('id, granted, remaining')
      .eq('user_id', user.id)
      .eq('kind', 'booster')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (passLoadError) {
      throw passLoadError;
    }

    if (existingPass) {
      const { error: passUpdateError } = await supabase
        .from('pass')
        .update({
          granted: existingPass.granted + product.granted,
          remaining: existingPass.remaining + product.granted,
          source: 'purchase',
        })
        .eq('id', existingPass.id);

      if (passUpdateError) {
        throw passUpdateError;
      }
    } else {
      const { error: passInsertError } = await supabase.from('pass').insert({
        granted: product.granted,
        kind: 'booster',
        remaining: product.granted,
        source: 'purchase',
        status: 'active',
        user_id: user.id,
      });

      if (passInsertError) {
        throw passInsertError;
      }
    }

    return jsonResponse({
      granted: product.granted,
      ok: true,
      paymentId,
      storeId,
    });
  } catch (error) {
    // MONEY PATH — payment update/pass load/update/insert 어디서 throw 하든
    // '사용자 결제했는데 아무것도 못 받음' 이 조용히 사라지던 지점. 반드시 기록.
    captureEdgeError('confirm-instant-rematch-payment', error, {
      stage: 'confirm_payment_grant',
      status: 500,
      userId,
      tags: { feature: 'payment', code: 'confirm_failed' },
      extra: { paymentId: capturedPaymentId, productId: capturedProductId },
    });
    const message = error instanceof Error ? error.message : 'failed to confirm payment';
    return errorResponse(message, 400);
  }
});

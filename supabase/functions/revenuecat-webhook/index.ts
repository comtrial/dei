import { createAdminClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  getPaymentAmount,
  getRefreshProductId,
  getUuidCandidate,
  isHeartProduct,
  toIsoDateFromMillis,
  type RevenueCatWebhookEvent,
} from '../_shared/revenuecat.ts';

type RevenueCatWebhookBody = {
  api_version?: string;
  event?: RevenueCatWebhookEvent;
};

const purchaseEventTypes = new Set(['NON_RENEWING_PURCHASE']);
const refundEventTypes = new Set(['CANCELLATION']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  try {
    const expectedAuthorization = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN');

    if (expectedAuthorization && req.headers.get('Authorization') !== expectedAuthorization) {
      return errorResponse('unauthorized', 401);
    }

    const supabase = createAdminClient();
    const body = await req.json() as RevenueCatWebhookBody;
    const event = body.event;

    if (!event?.id || !event.type) {
      return errorResponse('RevenueCat event id and type are required');
    }

    const existingEvent = await supabase
      .from('revenuecat_webhook_events')
      .select('id, processed_at')
      .eq('id', event.id)
      .maybeSingle();

    if (existingEvent.error) {
      throw existingEvent.error;
    }

    if (existingEvent.data?.processed_at) {
      return jsonResponse({ duplicate: true, ok: true });
    }

    if (!existingEvent.data) {
      const insertEvent = await supabase.from('revenuecat_webhook_events').insert({
        aliases: event.aliases ?? [],
        app_user_id: event.app_user_id ?? null,
        environment: event.environment ?? null,
        event_type: event.type,
        id: event.id,
        original_app_user_id: event.original_app_user_id ?? null,
        payload: body,
        product_id: event.product_id ?? null,
        transaction_id: event.transaction_id ?? null,
      });

      if (insertEvent.error) {
        throw insertEvent.error;
      }
    }

    const productId = event.product_id;
    const refreshProductId = getRefreshProductId();
    const isHeart = productId ? isHeartProduct(productId) : false;
    const isKnownProduct = productId === refreshProductId || isHeart;

    if (!productId || !isKnownProduct || event.type === 'TEST') {
      await supabase
        .from('revenuecat_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);

      return jsonResponse({ ignored: true, ok: true });
    }

    const userId = getUuidCandidate(
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
    );

    if (!userId) {
      return errorResponse('RevenueCat app_user_id does not map to a Supabase user id', 422);
    }

    if (purchaseEventTypes.has(event.type)) {
      if (!event.transaction_id) {
        return errorResponse('RevenueCat transaction_id is required');
      }

      const existingPayment = await supabase
        .from('payments')
        .select('id')
        .eq('provider', 'revenuecat')
        .eq('revenuecat_transaction_id', event.transaction_id)
        .maybeSingle();

      if (existingPayment.error) {
        throw existingPayment.error;
      }

      const paymentPayload = {
        amount: getPaymentAmount(event.price_in_purchased_currency),
        currency: event.currency ?? 'KRW',
        environment: event.environment ?? null,
        external_tx_id: event.transaction_id,
        offering_id: event.presented_offering_id ?? null,
        payment_method: 'IAP',
        product_id: productId,
        product_type: isHeart ? 'HEART' : 'REFRESH',
        provider: 'revenuecat',
        purchased_at: toIsoDateFromMillis(event.purchased_at_ms) ?? new Date().toISOString(),
        raw_payload: {
          event,
          source: 'revenuecat-webhook',
        },
        revenuecat_app_user_id: event.app_user_id ?? null,
        revenuecat_event_id: event.id,
        revenuecat_original_app_user_id: event.original_app_user_id ?? null,
        revenuecat_transaction_id: event.transaction_id,
        store: event.store ?? null,
        user_id: userId,
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
        p_user_id: userId,
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
          eventId: event.id,
          paymentId: paymentResult.data.id,
          productId,
          refreshGrantId: grantResult.data?.id ?? null,
          source: 'revenuecat-webhook',
        },
        p_route: '/home',
        p_title: isHeart ? '하트가 충전됐어요' : '매칭 이용권이 충전됐어요',
        p_type: 'payment_succeeded',
        p_user_id: userId,
      });

      if (notificationResult.error) {
        throw notificationResult.error;
      }
    }

    if (refundEventTypes.has(event.type) && event.transaction_id) {
      const paymentResult = await supabase
        .from('payments')
        .update({
          raw_payload: {
            event,
            source: 'revenuecat-webhook-refund',
          },
          refunded_at: new Date().toISOString(),
          revenuecat_event_id: event.id,
        })
        .eq('provider', 'revenuecat')
        .eq('revenuecat_transaction_id', event.transaction_id)
        .select('id')
        .maybeSingle();

      if (paymentResult.error) {
        throw paymentResult.error;
      }

      if (paymentResult.data?.id) {
        const revokeResult = await supabase.rpc('revoke_refresh_item_grant_for_payment', {
          p_payment_id: paymentResult.data.id,
          p_revoke_reason: 'refund',
        });

        if (revokeResult.error) {
          throw revokeResult.error;
        }

        const notificationResult = await supabase.rpc('create_notification', {
          p_body: '환불 처리된 결제의 남은 하트가 회수됐어요.',
          p_dedupe_key: `payment:${paymentResult.data.id}:refund`,
          p_metadata: {
            eventId: event.id,
            paymentId: paymentResult.data.id,
            source: 'revenuecat-webhook',
          },
          p_route: '/home',
          p_title: '결제 환불이 처리됐어요',
          p_type: 'payment_refunded',
          p_user_id: userId,
        });

        if (notificationResult.error) {
          throw notificationResult.error;
        }
      }
    }

    const markProcessed = await supabase
      .from('revenuecat_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);

    if (markProcessed.error) {
      throw markProcessed.error;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'failed to process RevenueCat webhook',
      400,
    );
  }
});

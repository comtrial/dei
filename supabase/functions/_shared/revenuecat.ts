export type RevenueCatNonSubscription = {
  id?: string;
  is_sandbox?: boolean;
  purchase_date?: string;
  store?: string;
  store_transaction_id?: string;
  transaction_id?: string;
};

export type RevenueCatSubscriberResponse = {
  subscriber?: {
    non_subscriptions?: Record<string, RevenueCatNonSubscription[]>;
    original_app_user_id?: string;
  };
};

export type RevenueCatWebhookEvent = {
  aliases?: string[];
  app_user_id?: string;
  currency?: string | null;
  environment?: string | null;
  id?: string;
  original_app_user_id?: string;
  presented_offering_id?: string | null;
  price_in_purchased_currency?: number | null;
  product_id?: string;
  purchased_at_ms?: number | null;
  store?: string | null;
  transaction_id?: string;
  type?: string;
};

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export function getRefreshProductId() {
  return Deno.env.get('REVENUECAT_REFRESH_PRODUCT_ID') || 'dei_refresh_1';
}

export function getPaymentAmount(price: unknown) {
  return typeof price === 'number' && Number.isFinite(price) ? Math.round(price) : 0;
}

export function toIsoDateFromMillis(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

export function getUuidCandidate(...values: Array<string | undefined | null>) {
  return values.find((value) =>
    Boolean(
      value?.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    ),
  ) ?? null;
}

export function findRevenueCatNonSubscription(
  subscriber: RevenueCatSubscriberResponse,
  productId: string,
  transactionId?: string,
) {
  const purchases = subscriber.subscriber?.non_subscriptions?.[productId] ?? [];

  if (!transactionId) {
    return purchases.at(-1) ?? null;
  }

  return purchases.find((purchase) =>
    purchase.id === transactionId
    || purchase.transaction_id === transactionId
    || purchase.store_transaction_id === transactionId
  ) ?? null;
}

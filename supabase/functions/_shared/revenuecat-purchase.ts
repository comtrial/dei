export type RevenueCatTransaction = {
  id?: unknown;
  is_sandbox?: unknown;
  purchase_date?: unknown;
  store?: unknown;
  store_transaction_id?: unknown;
  transaction_id?: unknown;
};

export type RevenueCatSubscriberResponse = {
  subscriber?: {
    non_subscriptions?: Record<string, RevenueCatTransaction[]>;
    original_app_user_id?: unknown;
  };
};

export function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getRevenueCatTransactionIdentifier(
  transaction: RevenueCatTransaction,
) {
  return getString(transaction.id) ||
    getString(transaction.store_transaction_id) ||
    getString(transaction.transaction_id);
}

export function getRevenueCatPurchaseTime(transaction: RevenueCatTransaction) {
  const purchaseDate = getString(transaction.purchase_date);
  const time = purchaseDate ? new Date(purchaseDate).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function findVerifiedRevenueCatTransaction({
  revenueCatProductId,
  subscriber,
  transactionId,
}: {
  revenueCatProductId: string;
  subscriber: RevenueCatSubscriberResponse;
  transactionId: string;
}) {
  const productTransactions =
    subscriber.subscriber?.non_subscriptions?.[revenueCatProductId] ?? [];
  const byClientTransaction = productTransactions.find((transaction) =>
    getRevenueCatTransactionIdentifier(transaction) === transactionId
  );

  if (byClientTransaction) {
    return byClientTransaction;
  }

  return productTransactions
    .filter((transaction) => getRevenueCatTransactionIdentifier(transaction))
    .sort((a, b) =>
      getRevenueCatPurchaseTime(b) - getRevenueCatPurchaseTime(a)
    )[0] ?? null;
}

import assert from "node:assert/strict";

import {
  findVerifiedRevenueCatTransaction,
  getRevenueCatTransactionIdentifier,
} from "./revenuecat-purchase.ts";

Deno.test("RevenueCat transaction identifier accepts all supported id fields", () => {
  assert.equal(getRevenueCatTransactionIdentifier({ id: "api-id" }), "api-id");
  assert.equal(
    getRevenueCatTransactionIdentifier({ store_transaction_id: "store-id" }),
    "store-id",
  );
  assert.equal(
    getRevenueCatTransactionIdentifier({ transaction_id: "tx-id" }),
    "tx-id",
  );
});

Deno.test("RevenueCat transaction lookup prefers the client transaction id", () => {
  const transaction = findVerifiedRevenueCatTransaction({
    revenueCatProductId: "booster_1",
    subscriber: {
      subscriber: {
        non_subscriptions: {
          booster_1: [
            { id: "older", purchase_date: "2026-06-07T00:00:00Z" },
            { id: "client-tx", purchase_date: "2026-06-07T00:00:01Z" },
          ],
        },
      },
    },
    transactionId: "client-tx",
  });

  assert.equal(transaction?.id, "client-tx");
});

Deno.test("RevenueCat transaction lookup falls back to the latest product transaction", () => {
  const transaction = findVerifiedRevenueCatTransaction({
    revenueCatProductId: "booster_1",
    subscriber: {
      subscriber: {
        non_subscriptions: {
          booster_1: [
            { id: "older", purchase_date: "2026-06-07T00:00:00Z" },
            { id: "newer", purchase_date: "2026-06-07T00:00:02Z" },
          ],
          booster_pack3: [
            { id: "other-product", purchase_date: "2026-06-07T00:00:03Z" },
          ],
        },
      },
    },
    transactionId: "missing-client-tx",
  });

  assert.equal(transaction?.id, "newer");
});

Deno.test("RevenueCat transaction lookup returns null when product has no valid transactions", () => {
  const transaction = findVerifiedRevenueCatTransaction({
    revenueCatProductId: "booster_1",
    subscriber: {
      subscriber: {
        non_subscriptions: {
          booster_1: [{ id: "   ", purchase_date: "2026-06-07T00:00:00Z" }],
        },
      },
    },
    transactionId: "missing-client-tx",
  });

  assert.equal(transaction, null);
});

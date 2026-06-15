import { describe, expect, it, vi } from 'vitest';

import {
  confirmInstantRematchApplePurchase,
  type ConfirmPurchaseBody,
} from './instant-rematch-confirm.ts';
import type { VerifiedAppStoreTransaction } from './app-store-transaction.ts';

function verifiedTransaction(overrides: Partial<VerifiedAppStoreTransaction> = {}) {
  return {
    appAccountToken: 'user-1',
    bundleId: 'kr.cmdsoftware.dei',
    environment: 'Sandbox',
    originalTransactionId: 'tx-0',
    productId: 'booster_instant_rematch_v1',
    purchaseDate: 1_786_000_000_000,
    quantity: 1,
    signedDate: 1_786_000_000_100,
    signedTransactionInfo: 'signed-jws',
    transactionId: 'tx-1',
    type: 'Consumable',
    webOrderLineItemId: 'line-1',
    ...overrides,
  } satisfies VerifiedAppStoreTransaction;
}

function supabaseRpc(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  };
}

const validBody: ConfirmPurchaseBody = {
  environment: 'Sandbox',
  productId: 'booster_instant_rematch_v1',
  signedTransactionInfo: 'client-jws',
  storeProductId: 'booster_instant_rematch_v1',
  transactionDate: 1_786_000_000_000,
  transactionId: 'tx-1',
};

describe('confirmInstantRematchApplePurchase', () => {
  it('verifies an Apple transaction and calls grant RPC with apple_iap provider', async () => {
    const supabase = supabaseRpc({
      duplicate: false,
      granted: 1,
      payment_id: 'payment-1',
    });
    const verifyTransaction = vi.fn().mockResolvedValue(verifiedTransaction());

    await expect(confirmInstantRematchApplePurchase({
      body: validBody,
      getEnv: () => undefined,
      supabase,
      userId: 'user-1',
      verifyTransaction,
    })).resolves.toMatchObject({
      duplicate: false,
      granted: 1,
      paymentId: 'payment-1',
      productId: 'booster_instant_rematch_v1',
      provider: 'apple_iap',
      storeProductId: 'booster_instant_rematch_v1',
      transactionId: 'tx-1',
    });

    expect(verifyTransaction).toHaveBeenCalledWith({
      expectedProductId: 'booster_instant_rematch_v1',
      expectedUserId: 'user-1',
      transactionId: 'tx-1',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('grant_instant_rematch_purchase', {
      p_granted: 1,
      p_product_id: 'booster_instant_rematch_v1',
      p_provider: 'apple_iap',
      p_provider_metadata: expect.objectContaining({
        appAccountToken: 'user-1',
        appleEnvironment: 'Sandbox',
        appStoreProductId: 'booster_instant_rematch_v1',
        clientSignedTransactionInfoPresent: true,
      }),
      p_provider_transaction_id: 'tx-1',
      p_user_id: 'user-1',
    });
  });

  it('rejects product id mismatch before Apple verification or RPC grant', async () => {
    const supabase = supabaseRpc(null);
    const verifyTransaction = vi.fn();

    await expect(confirmInstantRematchApplePurchase({
      body: {
        ...validBody,
        storeProductId: 'booster_instant_rematch_v1_pack3',
      },
      getEnv: () => undefined,
      supabase,
      userId: 'user-1',
      verifyTransaction,
    })).rejects.toThrow(/App Store product id does not match/);

    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('preserves duplicate grant responses so repeated transactions do not add passes', async () => {
    const supabase = supabaseRpc({
      duplicate: true,
      granted: 0,
      payment_id: 'payment-existing',
    });

    await expect(confirmInstantRematchApplePurchase({
      body: validBody,
      getEnv: () => undefined,
      supabase,
      userId: 'user-1',
      verifyTransaction: vi.fn().mockResolvedValue(verifiedTransaction()),
    })).resolves.toMatchObject({
      duplicate: true,
      granted: 0,
      paymentId: 'payment-existing',
      transactionId: 'tx-1',
    });
  });

  it('fails before RPC when required App Store Server API env is missing', async () => {
    const supabase = supabaseRpc(null);

    await expect(confirmInstantRematchApplePurchase({
      body: validBody,
      getEnv: (name) => ({
        APP_STORE_BUNDLE_ID: 'kr.cmdsoftware.dei',
        APP_STORE_CONNECT_ISSUER_ID: 'issuer',
        APP_STORE_CONNECT_KEY_ID: 'key-id',
        APP_STORE_ENVIRONMENT: 'sandbox',
      })[name],
      supabase,
      userId: 'user-1',
    })).rejects.toThrow(/APP_STORE_CONNECT_PRIVATE_KEY is not configured/);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

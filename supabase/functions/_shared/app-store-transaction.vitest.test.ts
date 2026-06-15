import { describe, expect, it } from 'vitest';

import {
  decodeJwsPayload,
  getAppStoreApiEndpoint,
  getAppStoreServerConfig,
  validateAppStoreSignedTransaction,
} from './app-store-transaction.ts';

function base64UrlEncodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64url');
}

function makeJws(payload: Record<string, unknown>) {
  return `${base64UrlEncodeJson({ alg: 'ES256' })}.${
    base64UrlEncodeJson(payload)
  }.signature`;
}

describe('App Store transaction verification helpers', () => {
  it('decodes signedTransactionInfo payloads', () => {
    const jws = makeJws({ transactionId: 'tx-1' });

    expect(decodeJwsPayload(jws)).toMatchObject({ transactionId: 'tx-1' });
  });

  it('accepts a matching consumable Apple transaction', () => {
    const jws = makeJws({
      appAccountToken: 'user-1',
      bundleId: 'kr.cmdsoftware.dei',
      environment: 'Sandbox',
      originalTransactionId: 'tx-0',
      productId: 'booster_instant_rematch_v1',
      purchaseDate: 1_786_000_000_000,
      quantity: 1,
      signedDate: 1_786_000_000_100,
      transactionId: 'tx-1',
      type: 'Consumable',
      webOrderLineItemId: 'line-1',
    });

    expect(validateAppStoreSignedTransaction({
      expectedBundleId: 'kr.cmdsoftware.dei',
      expectedProductId: 'booster_instant_rematch_v1',
      expectedUserId: 'user-1',
      signedTransactionInfo: jws,
      transactionId: 'tx-1',
    })).toMatchObject({
      appAccountToken: 'user-1',
      bundleId: 'kr.cmdsoftware.dei',
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1',
      transactionId: 'tx-1',
    });
  });

  it('rejects product id mismatch before grant RPC can run', () => {
    const jws = makeJws({
      bundleId: 'kr.cmdsoftware.dei',
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1_pack10',
      transactionId: 'tx-1',
      type: 'Consumable',
    });

    expect(() => validateAppStoreSignedTransaction({
      expectedBundleId: 'kr.cmdsoftware.dei',
      expectedProductId: 'booster_instant_rematch_v1',
      expectedUserId: 'user-1',
      signedTransactionInfo: jws,
      transactionId: 'tx-1',
    })).toThrow(/product id does not match/);
  });

  it('rejects a transaction for a different app account token', () => {
    const jws = makeJws({
      appAccountToken: 'other-user',
      bundleId: 'kr.cmdsoftware.dei',
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1',
      transactionId: 'tx-1',
      type: 'Consumable',
    });

    expect(() => validateAppStoreSignedTransaction({
      expectedBundleId: 'kr.cmdsoftware.dei',
      expectedProductId: 'booster_instant_rematch_v1',
      expectedUserId: 'user-1',
      signedTransactionInfo: jws,
      transactionId: 'tx-1',
    })).toThrow(/appAccountToken does not match/);
  });

  it('requires App Store Server API secrets to build server config', () => {
    expect(() => getAppStoreServerConfig((name) => ({
      APP_STORE_BUNDLE_ID: 'kr.cmdsoftware.dei',
      APP_STORE_CONNECT_ISSUER_ID: 'issuer',
      APP_STORE_CONNECT_KEY_ID: 'key',
      APP_STORE_ENVIRONMENT: 'sandbox',
    })[name])).toThrow(/APP_STORE_CONNECT_PRIVATE_KEY is not configured/);
  });

  it('selects the sandbox App Store Server API endpoint explicitly', () => {
    expect(getAppStoreApiEndpoint('sandbox')).toBe(
      'https://api.storekit-sandbox.itunes.apple.com',
    );
  });
});

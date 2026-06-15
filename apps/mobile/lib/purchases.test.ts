import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  fetchProducts: vi.fn(),
  finishTransaction: vi.fn(),
  functionsInvoke: vi.fn(),
  getTransactionJwsIOS: vi.fn(),
  initConnection: vi.fn(),
  purchaseErrorCallback: undefined as ((error: unknown) => void) | undefined,
  purchaseErrorListener: vi.fn(),
  purchaseUpdatedCallback: undefined as ((purchase: unknown) => void) | undefined,
  purchaseUpdatedListener: vi.fn(),
  requestPurchase: vi.fn(),
}));

vi.mock('@dei/shared', () => ({
  POLICY: {
    payment: {
      instantRematchProductId: 'booster_instant_rematch_v1',
    },
  },
  logger: {
    captureException: mocks.captureException,
    captureMessage: mocks.captureMessage,
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-iap', () => ({
  ErrorCode: { UserCancelled: 'user-cancelled' },
  fetchProducts: (...args: unknown[]) => mocks.fetchProducts(...args),
  finishTransaction: (...args: unknown[]) => mocks.finishTransaction(...args),
  getTransactionJwsIOS: (...args: unknown[]) => mocks.getTransactionJwsIOS(...args),
  initConnection: (...args: unknown[]) => mocks.initConnection(...args),
  purchaseErrorListener: (listener: (error: unknown) => void) => {
    mocks.purchaseErrorCallback = listener;
    mocks.purchaseErrorListener(listener);
    return { remove: vi.fn() };
  },
  purchaseUpdatedListener: (listener: (purchase: unknown) => void) => {
    mocks.purchaseUpdatedCallback = listener;
    mocks.purchaseUpdatedListener(listener);
    return { remove: vi.fn() };
  },
  requestPurchase: (...args: unknown[]) => mocks.requestPurchase(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mocks.functionsInvoke(...args),
    },
  },
}));

// eslint-disable-next-line import/first
import {
  confirmInstantRematchPurchase,
  createInstantRematchConfirmPayload,
  getAppStoreProductId,
  getBoosterPackageOptions,
  initPurchases,
  isPurchaseCancelled,
  purchaseInstantRematchPackage,
  syncPurchasesUser,
} from './purchases';

const booster1Product = {
  currency: 'KRW',
  description: '바로 매치 1회',
  displayPrice: '₩1,000',
  id: 'booster_instant_rematch_v1',
  isFamilyShareableIOS: false,
  isAutoRenewing: false,
  jsonRepresentationIOS: '{}',
  platform: 'ios',
  price: 1000,
  productId: 'booster_instant_rematch_v1',
  title: '바로 매치 1회',
  type: 'in-app',
  typeIOS: 'consumable',
} as const;

const booster3Product = {
  ...booster1Product,
  displayPrice: '₩2,700',
  id: 'booster_instant_rematch_v1_pack3',
  productId: 'booster_instant_rematch_v1_pack3',
  title: '바로 매치 3회',
} as const;

const boosterPurchase = {
  environmentIOS: 'Sandbox',
  id: 'tx-1',
  isAutoRenewing: false,
  platform: 'ios',
  productId: 'booster_instant_rematch_v1',
  purchaseState: 'purchased',
  purchaseToken: 'signed-jws',
  quantity: 1,
  store: 'apple',
  transactionDate: 1_786_000_000_000,
  transactionId: 'tx-1',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_1;
  mocks.initConnection.mockResolvedValue(true);
  mocks.fetchProducts.mockResolvedValue([booster1Product, booster3Product]);
  mocks.finishTransaction.mockResolvedValue(undefined);
});

describe('direct Apple IAP purchases client', () => {
  it('initializes expo-iap store connection for iOS native builds', async () => {
    expect(initPurchases()).toBe(true);
    await expect(mocks.initConnection.mock.results[0]?.value).resolves.toBe(true);
    expect(mocks.purchaseUpdatedListener).toHaveBeenCalled();
    expect(mocks.purchaseErrorListener).toHaveBeenCalled();
  });

  it('maps logical booster product ids to App Store product ids', () => {
    expect(getAppStoreProductId('booster_instant_rematch_v1')).toBe(
      'booster_instant_rematch_v1',
    );

    process.env.EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_1 = 'ios.booster.1';
    expect(getAppStoreProductId('booster_instant_rematch_v1')).toBe('ios.booster.1');
  });

  it('loads App Store products and uses localized display prices', async () => {
    const options = await getBoosterPackageOptions();

    expect(mocks.fetchProducts).toHaveBeenCalledWith({
      skus: [
        'booster_instant_rematch_v1',
        'booster_instant_rematch_v1_pack3',
        'booster_instant_rematch_v1_pack10',
      ],
      type: 'in-app',
    });
    expect(options.get('booster_instant_rematch_v1')).toMatchObject({
      packageId: 'booster_instant_rematch_v1',
      price: '₩1,000',
      storeProductId: 'booster_instant_rematch_v1',
    });
    expect(options.get('booster_instant_rematch_v1_pack3')).toMatchObject({
      price: '₩2,700',
      storeProductId: 'booster_instant_rematch_v1_pack3',
    });
  });

  it('returns a server confirmation payload from a purchased consumable transaction', async () => {
    await syncPurchasesUser('user-uuid');
    mocks.requestPurchase.mockImplementation(async () => {
      mocks.purchaseUpdatedCallback?.(boosterPurchase);
      return null;
    });

    await expect(purchaseInstantRematchPackage('booster_instant_rematch_v1')).resolves.toMatchObject({
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1',
      signedTransactionInfo: 'signed-jws',
      storeProductId: 'booster_instant_rematch_v1',
      transactionDate: 1_786_000_000_000,
      transactionId: 'tx-1',
    });
    expect(mocks.requestPurchase).toHaveBeenCalledWith({
      request: {
        apple: {
          appAccountToken: 'user-uuid',
          sku: 'booster_instant_rematch_v1',
        },
      },
      type: 'in-app',
    });
  });

  it('falls back to StoreKit transaction JWS lookup when purchaseToken is absent', async () => {
    mocks.getTransactionJwsIOS.mockResolvedValueOnce('lookup-jws');

    await expect(createInstantRematchConfirmPayload(
      'booster_instant_rematch_v1',
      { ...boosterPurchase, purchaseToken: null },
    )).resolves.toMatchObject({
      signedTransactionInfo: 'lookup-jws',
      transactionId: 'tx-1',
    });
    expect(mocks.getTransactionJwsIOS).toHaveBeenCalledWith('tx-1');
  });

  it('calls the Supabase confirm Edge Function without leaking the native purchase object', async () => {
    mocks.functionsInvoke.mockResolvedValueOnce({
      data: {
        granted: 1,
        ok: true,
        paymentId: 'payment-1',
        productId: 'booster_instant_rematch_v1',
        provider: 'apple_iap',
        storeProductId: 'booster_instant_rematch_v1',
        transactionId: 'tx-1',
      },
      error: null,
    });

    await confirmInstantRematchPurchase({
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1',
      purchase: boosterPurchase,
      signedTransactionInfo: 'signed-jws',
      storeProductId: 'booster_instant_rematch_v1',
      transactionDate: 1_786_000_000_000,
      transactionId: 'tx-1',
    });

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('confirm-instant-rematch-payment', {
      body: {
        environment: 'Sandbox',
        productId: 'booster_instant_rematch_v1',
        signedTransactionInfo: 'signed-jws',
        storeProductId: 'booster_instant_rematch_v1',
        transactionDate: 1_786_000_000_000,
        transactionId: 'tx-1',
      },
    });
    expect(mocks.finishTransaction).toHaveBeenCalledWith({
      isConsumable: true,
      purchase: boosterPurchase,
    });
  });

  it('detects Apple IAP purchase cancellation errors', () => {
    expect(isPurchaseCancelled({ code: 'user-cancelled' })).toBe(true);
    expect(isPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isPurchaseCancelled({ message: 'User cancelled the purchase' })).toBe(true);
    expect(isPurchaseCancelled({ code: 'network-error' })).toBe(false);
  });
});

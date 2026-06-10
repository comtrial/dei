import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  configure: vi.fn(),
  functionsInvoke: vi.fn(),
  getOfferings: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  purchasePackage: vi.fn(),
  setLogLevel: vi.fn(),
}));

vi.mock('@dei/shared', () => ({
  POLICY: {
    payment: {
      instantRematchProductId: 'booster_instant_rematch_v1',
    },
  },
  logger: {
    captureMessage: mocks.captureMessage,
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('react-native-purchases', () => ({
  default: {
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
    },
    configure: (...args: unknown[]) => mocks.configure(...args),
    getOfferings: (...args: unknown[]) => mocks.getOfferings(...args),
    logIn: (...args: unknown[]) => mocks.logIn(...args),
    logOut: (...args: unknown[]) => mocks.logOut(...args),
    purchasePackage: (...args: unknown[]) => mocks.purchasePackage(...args),
    setLogLevel: (...args: unknown[]) => mocks.setLogLevel(...args),
  },
  LOG_LEVEL: { DEBUG: 'debug' },
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
  getBoosterPackageOptions,
  initPurchases,
  isPurchaseCancelled,
  purchaseInstantRematchPackage,
  syncPurchasesUser,
} from './purchases';

const booster1Package = {
  identifier: 'booster_1',
  product: {
    identifier: 'booster_instant_rematch_v1',
    priceString: '₩1,000',
  },
};

const booster3Package = {
  identifier: 'booster_pack3',
  product: {
    identifier: 'booster_instant_rematch_v1_pack3',
    priceString: '₩2,700',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_test_key';
  delete process.env.EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_1;
  delete process.env.EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_1;
  mocks.getOfferings.mockResolvedValue({
    all: {
      booster: {
        availablePackages: [booster1Package, booster3Package],
        identifier: 'booster',
      },
    },
    current: null,
  });
  mocks.logIn.mockResolvedValue({ customerInfo: {} });
  mocks.setLogLevel.mockResolvedValue(undefined);
});

describe('RevenueCat purchases client', () => {
  it('configures RevenueCat with the iOS SDK key', () => {
    expect(initPurchases()).toBe(true);
    expect(mocks.configure).toHaveBeenCalledWith({ apiKey: 'appl_test_key' });
  });

  it('maps RevenueCat offering packages to booster product ids and prices', async () => {
    initPurchases();

    const options = await getBoosterPackageOptions();

    expect(options.get('booster_instant_rematch_v1')).toMatchObject({
      packageId: 'booster_1',
      price: '₩1,000',
      revenueCatProductId: 'booster_instant_rematch_v1',
    });
    expect(options.get('booster_instant_rematch_v1_pack3')).toMatchObject({
      packageId: 'booster_pack3',
      price: '₩2,700',
      revenueCatProductId: 'booster_instant_rematch_v1_pack3',
    });
  });

  it('returns a server confirmation payload from a purchased consumable transaction', async () => {
    initPurchases();
    await syncPurchasesUser('user-1');
    mocks.purchasePackage.mockResolvedValueOnce({
      customerInfo: {
        nonSubscriptionTransactions: [
          {
            productIdentifier: 'booster_instant_rematch_v1',
            purchaseDate: '2026-06-07T00:00:00Z',
            transactionIdentifier: 'tx-1',
          },
        ],
        originalAppUserId: '$RCAnonymousID:old',
        requestDate: '2026-06-07T00:00:01Z',
      },
      productIdentifier: 'booster_instant_rematch_v1',
    });

    await expect(purchaseInstantRematchPackage('booster_instant_rematch_v1')).resolves.toMatchObject({
      appUserId: 'user-1',
      customerInfoRequestDate: '2026-06-07T00:00:01Z',
      productId: 'booster_instant_rematch_v1',
      revenueCatProductId: 'booster_instant_rematch_v1',
      transactionId: 'tx-1',
    });
  });

  it('calls the Supabase confirm Edge Function with RevenueCat purchase identifiers', async () => {
    mocks.functionsInvoke.mockResolvedValueOnce({
      data: {
        granted: 1,
        ok: true,
        paymentId: 'payment-1',
        productId: 'booster_instant_rematch_v1',
        provider: 'revenuecat',
        revenueCatProductId: 'booster_instant_rematch_v1',
        transactionId: 'tx-1',
      },
      error: null,
    });

    await confirmInstantRematchPurchase({
      appUserId: 'user-1',
      customerInfoRequestDate: '2026-06-07T00:00:01Z',
      productId: 'booster_instant_rematch_v1',
      revenueCatProductId: 'booster_instant_rematch_v1',
      transactionId: 'tx-1',
    });

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('confirm-instant-rematch-payment', {
      body: {
        appUserId: 'user-1',
        customerInfoRequestDate: '2026-06-07T00:00:01Z',
        productId: 'booster_instant_rematch_v1',
        revenueCatProductId: 'booster_instant_rematch_v1',
        transactionId: 'tx-1',
      },
    });
  });

  it('detects RevenueCat purchase cancellation errors', () => {
    expect(isPurchaseCancelled({ code: '1' })).toBe(true);
    expect(isPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isPurchaseCancelled({ code: '2' })).toBe(false);
  });
});

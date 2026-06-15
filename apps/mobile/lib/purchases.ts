import { Platform } from 'react-native';
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getTransactionJwsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type ProductOrSubscription,
  type Purchase,
} from 'expo-iap';

import { logger, POLICY } from '@dei/shared';

import type { PaymentPackId } from '@/lib/b-flow';
import { supabase } from '@/lib/supabase';

export type BoosterPackageOption = {
  packageId: string;
  price: string;
  product: Product;
  productId: PaymentPackId;
  storeProductId: string;
};

export type ConfirmInstantRematchPurchasePayload = {
  environment?: string | null;
  productId: PaymentPackId;
  purchase?: Purchase;
  signedTransactionInfo?: string | null;
  storeProductId: string;
  transactionDate?: number | null;
  transactionId: string;
};

export type ConfirmInstantRematchPurchaseResponse = {
  duplicate?: boolean;
  granted: number;
  ok: true;
  paymentId: string;
  productId: string;
  provider: 'apple_iap';
  storeProductId: string;
  transactionId: string;
};

export type PurchaseInstantRematchResult = ConfirmInstantRematchPurchasePayload & {
  purchase: Purchase;
};

type PendingPurchaseRequest = {
  productId: string;
  reject: (error: unknown) => void;
  resolve: (purchase: Purchase) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PurchaseErrorLike = {
  code?: unknown;
  message?: unknown;
  userCancelled?: unknown;
};

const DEFAULT_BOOSTER_PRODUCT_IDS = {
  pack1: POLICY.payment.instantRematchProductId,
  pack3: `${POLICY.payment.instantRematchProductId}_pack3`,
  pack10: `${POLICY.payment.instantRematchProductId}_pack10`,
} as const;

const BOOSTER_STORE_PRODUCT_CONFIG = [
  {
    env: 'EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_1',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack1,
  },
  {
    env: 'EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_3',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack3,
  },
  {
    env: 'EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_10',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack10,
  },
] as const;

const PURCHASE_TIMEOUT_MS = 120_000;

let connectionPromise: Promise<boolean> | null = null;
let connected = false;
let currentAppAccountToken: string | null = null;
let pendingPurchase: PendingPurchaseRequest | null = null;
let purchaseErrorSubscription: { remove: () => void } | null = null;
let purchaseUpdatedSubscription: { remove: () => void } | null = null;

function getPackConfig(productId: string) {
  const config = BOOSTER_STORE_PRODUCT_CONFIG.find((pack) => pack.productId === productId);
  if (!config) {
    throw new Error('지원하지 않는 바로 매치 상품이에요.');
  }

  return config;
}

function getEnvValue(name: string) {
  return process.env[name]?.trim() || '';
}

export function getAppStoreProductId(productId: PaymentPackId) {
  const config = getPackConfig(productId);
  return getEnvValue(config.env) || config.productId;
}

export function isPurchasesConfigured() {
  return connected || connectionPromise !== null;
}

function isIosIapSupported() {
  return Platform.OS === 'ios';
}

function clearPendingPurchase() {
  if (!pendingPurchase) return;
  clearTimeout(pendingPurchase.timeoutId);
  pendingPurchase = null;
}

function findMatchingPurchase(
  purchase: Purchase | Purchase[] | null | undefined,
  storeProductId: string,
) {
  const purchases = Array.isArray(purchase) ? purchase : purchase ? [purchase] : [];
  return purchases.find((candidate) => candidate.productId === storeProductId) ?? null;
}

function isInAppStoreProduct(product: ProductOrSubscription): product is Product {
  return product.type === 'in-app';
}

function resolvePendingPurchase(purchase: Purchase) {
  const request = pendingPurchase;
  if (!request || purchase.productId !== request.productId) {
    return;
  }

  clearPendingPurchase();
  request.resolve(purchase);
}

function rejectPendingPurchase(error: unknown) {
  const request = pendingPurchase;
  if (!request) {
    return;
  }

  clearPendingPurchase();
  request.reject(error);
}

function createPendingPurchase(productId: string) {
  if (pendingPurchase) {
    throw new Error('이미 진행 중인 스토어 결제가 있어요.');
  }

  return new Promise<Purchase>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      rejectPendingPurchase(new Error('스토어 결제 응답 시간이 초과됐어요.'));
    }, PURCHASE_TIMEOUT_MS);

    pendingPurchase = {
      productId,
      reject,
      resolve,
      timeoutId,
    };
  });
}

function setupPurchaseListeners() {
  if (purchaseUpdatedSubscription || purchaseErrorSubscription) {
    return;
  }

  purchaseUpdatedSubscription = purchaseUpdatedListener((purchase) => {
    resolvePendingPurchase(purchase);
  });
  purchaseErrorSubscription = purchaseErrorListener((error) => {
    rejectPendingPurchase(error);
  });
}

export function initPurchases() {
  if (!isIosIapSupported()) {
    logger.captureMessage('Apple IAP is only enabled on iOS builds', 'warning', {
      tags: { feature: 'payment', provider: 'apple_iap', action: 'init' },
      extra: { platform: Platform.OS },
    });
    connected = false;
    connectionPromise = null;
    return false;
  }

  setupPurchaseListeners();

  if (!connectionPromise) {
    connectionPromise = initConnection()
      .then((result) => {
        connected = result === true;
        return connected;
      })
      .catch((error) => {
        connected = false;
        connectionPromise = null;
        logger.captureException(error, {
          tags: { feature: 'payment', provider: 'apple_iap', action: 'init' },
        });
        return false;
      });
  }

  return true;
}

async function requirePurchasesConfigured() {
  if (!initPurchases() || !connectionPromise) {
    throw new Error('iOS 인앱결제는 네이티브 iOS 빌드에서만 사용할 수 있어요.');
  }

  const ready = await connectionPromise;
  if (!ready) {
    throw new Error('스토어 결제 연결을 시작하지 못했어요.');
  }
}

export async function syncPurchasesUser(userId: string) {
  currentAppAccountToken = userId;
}

export async function resetPurchasesUser() {
  currentAppAccountToken = null;
}

export async function getBoosterPackageOptions() {
  await requirePurchasesConfigured();

  const storeProductIds = BOOSTER_STORE_PRODUCT_CONFIG.map((config) =>
    getAppStoreProductId(config.productId as PaymentPackId)
  );
  const products = await fetchProducts({
    skus: storeProductIds,
    type: 'in-app',
  });
  const inAppProducts = (products ?? []).filter(isInAppStoreProduct);
  const options = new Map<PaymentPackId, BoosterPackageOption>();

  for (const config of BOOSTER_STORE_PRODUCT_CONFIG) {
    const productId = config.productId as PaymentPackId;
    const storeProductId = getAppStoreProductId(productId);
    const product = inAppProducts.find((candidate) => candidate.id === storeProductId);

    if (!product) {
      continue;
    }

    options.set(productId, {
      packageId: product.id,
      price: product.displayPrice,
      product,
      productId,
      storeProductId: product.id,
    });
  }

  if (options.size === 0) {
    throw new Error('바로 매치 App Store 상품 구성이 비어 있어요.');
  }

  return options;
}

function requireTransactionId(purchase: Purchase) {
  const transactionId = purchase.transactionId || purchase.id;
  if (!transactionId) {
    throw new Error(`스토어 거래 식별자를 확인할 수 없어요. (${purchase.productId})`);
  }

  return transactionId;
}

async function getSignedTransactionInfo(purchase: Purchase, transactionId: string) {
  const purchaseToken = purchase.purchaseToken?.trim();
  if (purchaseToken) {
    return purchaseToken;
  }

  try {
    return await getTransactionJwsIOS(transactionId);
  } catch (error) {
    logger.captureMessage('App Store transaction JWS lookup skipped', 'warning', {
      tags: { feature: 'payment', provider: 'apple_iap', action: 'get-transaction-jws' },
      extra: { reason: error instanceof Error ? error.message : String(error), transactionId },
    });
    return null;
  }
}

export async function createInstantRematchConfirmPayload(
  productId: PaymentPackId,
  purchase: Purchase,
) {
  const expectedStoreProductId = getAppStoreProductId(productId);
  if (purchase.productId !== expectedStoreProductId) {
    throw new Error('구매한 App Store 상품과 선택한 바로 매치 상품이 달라요.');
  }

  const transactionId = requireTransactionId(purchase);
  const signedTransactionInfo = await getSignedTransactionInfo(purchase, transactionId);

  return {
    environment: 'environmentIOS' in purchase ? purchase.environmentIOS ?? null : null,
    productId,
    purchase,
    signedTransactionInfo,
    storeProductId: purchase.productId,
    transactionDate: purchase.transactionDate,
    transactionId,
  } satisfies PurchaseInstantRematchResult;
}

export async function purchaseInstantRematchPackage(productId: PaymentPackId) {
  await requirePurchasesConfigured();

  const options = await getBoosterPackageOptions();
  const option = options.get(productId);

  if (!option) {
    throw new Error('선택한 바로 매치 상품을 App Store에서 찾을 수 없어요.');
  }

  const purchasePromise = createPendingPurchase(option.storeProductId);

  try {
    const result = await requestPurchase({
      request: {
        apple: {
          appAccountToken: currentAppAccountToken ?? undefined,
          sku: option.storeProductId,
        },
      },
      type: 'in-app',
    });
    const immediatePurchase = findMatchingPurchase(result, option.storeProductId);
    if (immediatePurchase) {
      resolvePendingPurchase(immediatePurchase);
    }
  } catch (error) {
    clearPendingPurchase();
    throw error;
  }

  const purchase = await purchasePromise;
  return createInstantRematchConfirmPayload(productId, purchase);
}

export async function confirmInstantRematchPurchase(
  payload: ConfirmInstantRematchPurchasePayload,
) {
  const body = {
    environment: payload.environment ?? null,
    productId: payload.productId,
    signedTransactionInfo: payload.signedTransactionInfo ?? null,
    storeProductId: payload.storeProductId,
    transactionDate: payload.transactionDate ?? null,
    transactionId: payload.transactionId,
  };
  const { data, error } = await supabase.functions.invoke<ConfirmInstantRematchPurchaseResponse>(
    'confirm-instant-rematch-payment',
    {
      body,
    },
  );

  if (error || !data) {
    throw new Error(error?.message || '스토어 결제를 확인할 수 없어요.');
  }

  if (payload.purchase) {
    try {
      await finishTransaction({ isConsumable: true, purchase: payload.purchase });
    } catch (finishError) {
      logger.captureException(finishError, {
        tags: { feature: 'payment', provider: 'apple_iap', action: 'finish-transaction' },
        extra: { productId: payload.productId, transactionId: payload.transactionId },
      });
    }
  }

  return data;
}

export function isPurchaseCancelled(error: unknown) {
  const purchaseError = error as PurchaseErrorLike;
  return purchaseError.userCancelled === true
    || purchaseError.code === ErrorCode.UserCancelled
    || purchaseError.code === 'user-cancelled'
    || String(purchaseError.message ?? '').toLowerCase().includes('cancel');
}

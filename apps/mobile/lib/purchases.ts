import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesStoreTransaction,
} from 'react-native-purchases';

import { logger, POLICY } from '@dei/shared';

import type { PaymentPackId } from '@/lib/b-flow';
import { supabase } from '@/lib/supabase';

export type BoosterPackageOption = {
  package: PurchasesPackage;
  packageId: string;
  price: string;
  productId: PaymentPackId;
  revenueCatProductId: string;
};

export type ConfirmInstantRematchPurchasePayload = {
  appUserId: string;
  customerInfoRequestDate: string;
  productId: PaymentPackId;
  revenueCatProductId: string;
  transactionId: string;
};

export type ConfirmInstantRematchPurchaseResponse = {
  duplicate?: boolean;
  granted: number;
  ok: true;
  paymentId: string;
  productId: string;
  provider: 'revenuecat';
  revenueCatProductId: string;
  transactionId: string;
};

export type PurchaseInstantRematchResult = ConfirmInstantRematchPurchasePayload & {
  customerInfo: CustomerInfo;
};

type PurchasesErrorLike = {
  code?: unknown;
  message?: unknown;
  readableErrorCode?: unknown;
  userCancelled?: unknown;
};

const DEFAULT_BOOSTER_PRODUCT_IDS = {
  pack1: POLICY.payment.instantRematchProductId,
  pack3: `${POLICY.payment.instantRematchProductId}_pack3`,
  pack10: `${POLICY.payment.instantRematchProductId}_pack10`,
} as const;

const BOOSTER_PACK_CONFIG = [
  {
    packageEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_1',
    packageId: 'booster_1',
    productEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_1',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack1,
  },
  {
    packageEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_3',
    packageId: 'booster_pack3',
    productEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_3',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack3,
  },
  {
    packageEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_10',
    packageId: 'booster_pack10',
    productEnv: 'EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_10',
    productId: DEFAULT_BOOSTER_PRODUCT_IDS.pack10,
  },
] as const;

const BOOSTER_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_BOOSTER_OFFERING_ID?.trim() || 'booster';

let configured = false;
let configuredApiKey: string | null = null;
let currentRevenueCatUserId: string | null = null;

function getRevenueCatApiKey() {
  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();

  if (Platform.OS === 'ios') return iosKey ?? '';
  if (Platform.OS === 'android') return androidKey ?? '';
  return '';
}

function getPackConfig(productId: string) {
  const config = BOOSTER_PACK_CONFIG.find((pack) => pack.productId === productId);
  if (!config) {
    throw new Error('지원하지 않는 바로 매치 상품이에요.');
  }

  return config;
}

function getEnvValue(name: string) {
  return process.env[name]?.trim() || '';
}

export function getRevenueCatProductId(productId: PaymentPackId) {
  const config = getPackConfig(productId);
  return getEnvValue(config.productEnv) || config.productId;
}

export function getRevenueCatPackageId(productId: PaymentPackId) {
  const config = getPackConfig(productId);
  return getEnvValue(config.packageEnv) || config.packageId;
}

export function isPurchasesConfigured() {
  return configured;
}

export function initPurchases() {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    configured = false;
    logger.captureMessage('RevenueCat SDK key is not configured', 'warning', {
      tags: { feature: 'payment', provider: 'revenuecat', action: 'init' },
      extra: { platform: Platform.OS },
    });
    return false;
  }

  if (configured && configuredApiKey === apiKey) {
    return true;
  }

  Purchases.configure({ apiKey });
  configured = true;
  configuredApiKey = apiKey;

  if (__DEV__) {
    void Purchases.setLogLevel(LOG_LEVEL.DEBUG).catch(() => undefined);
  }

  return true;
}

function requirePurchasesConfigured() {
  if (!configured && !initPurchases()) {
    throw new Error('스토어 결제 설정이 아직 완료되지 않았어요.');
  }
}

export async function syncPurchasesUser(userId: string) {
  if (!configured && !initPurchases()) {
    return;
  }

  if (currentRevenueCatUserId === userId) {
    return;
  }

  await Purchases.logIn(userId);
  currentRevenueCatUserId = userId;
}

export async function resetPurchasesUser() {
  if (!configured || !currentRevenueCatUserId) {
    currentRevenueCatUserId = null;
    return;
  }

  try {
    await Purchases.logOut();
  } catch (error) {
    logger.captureMessage('RevenueCat logout skipped', 'warning', {
      tags: { feature: 'payment', provider: 'revenuecat', action: 'logout' },
      extra: { reason: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    currentRevenueCatUserId = null;
  }
}

function findPackageForProduct(
  packages: PurchasesPackage[],
  productId: PaymentPackId,
) {
  const expectedPackageId = getRevenueCatPackageId(productId);
  const expectedProductId = getRevenueCatProductId(productId);

  return packages.find((candidate) =>
    candidate.identifier === expectedPackageId
    || candidate.identifier === productId
    || candidate.product.identifier === expectedProductId
    || candidate.product.identifier === productId
  ) ?? null;
}

export async function getBoosterPackageOptions() {
  requirePurchasesConfigured();

  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[BOOSTER_OFFERING_ID] ?? offerings.current;

  if (!offering) {
    throw new Error('바로 매치 스토어 상품을 찾을 수 없어요.');
  }

  const options = new Map<PaymentPackId, BoosterPackageOption>();

  for (const config of BOOSTER_PACK_CONFIG) {
    const productId = config.productId as PaymentPackId;
    const purchasesPackage = findPackageForProduct(offering.availablePackages, productId);

    if (!purchasesPackage) {
      continue;
    }

    options.set(productId, {
      package: purchasesPackage,
      packageId: purchasesPackage.identifier,
      price: purchasesPackage.product.priceString,
      productId,
      revenueCatProductId: purchasesPackage.product.identifier,
    });
  }

  if (options.size === 0) {
    throw new Error('바로 매치 상품 구성이 비어 있어요.');
  }

  return options;
}

function findPurchasedTransaction(customerInfo: CustomerInfo, revenueCatProductId: string) {
  const transactions = customerInfo.nonSubscriptionTransactions
    .filter((transaction) => transaction.productIdentifier === revenueCatProductId)
    .sort((a, b) => Date.parse(b.purchaseDate) - Date.parse(a.purchaseDate));

  return transactions[0] ?? null;
}

function requireTransaction(
  transaction: PurchasesStoreTransaction | null,
  revenueCatProductId: string,
) {
  if (!transaction?.transactionIdentifier) {
    throw new Error(`스토어 거래 식별자를 확인할 수 없어요. (${revenueCatProductId})`);
  }

  return transaction;
}

export async function purchaseInstantRematchPackage(productId: PaymentPackId) {
  const options = await getBoosterPackageOptions();
  const option = options.get(productId);

  if (!option) {
    throw new Error('선택한 바로 매치 상품을 스토어에서 찾을 수 없어요.');
  }

  const result = await Purchases.purchasePackage(option.package);
  const transaction = requireTransaction(
    findPurchasedTransaction(result.customerInfo, option.revenueCatProductId),
    option.revenueCatProductId,
  );

  return {
    appUserId: currentRevenueCatUserId ?? result.customerInfo.originalAppUserId,
    customerInfo: result.customerInfo,
    customerInfoRequestDate: result.customerInfo.requestDate,
    productId,
    revenueCatProductId: option.revenueCatProductId,
    transactionId: transaction.transactionIdentifier,
  } satisfies PurchaseInstantRematchResult;
}

export async function confirmInstantRematchPurchase(
  payload: ConfirmInstantRematchPurchasePayload,
) {
  const { data, error } = await supabase.functions.invoke<ConfirmInstantRematchPurchaseResponse>(
    'confirm-instant-rematch-payment',
    {
      body: payload,
    },
  );

  if (error || !data) {
    throw new Error(error?.message || '스토어 결제를 확인할 수 없어요.');
  }

  return data;
}

export function isPurchaseCancelled(error: unknown) {
  const purchasesError = error as PurchasesErrorLike;
  return purchasesError.userCancelled === true
    || purchasesError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    || purchasesError.readableErrorCode === 'PURCHASE_CANCELLED';
}

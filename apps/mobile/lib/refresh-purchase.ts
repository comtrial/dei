import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import {
  configureRevenueCat,
  getRefreshOfferingId,
  getRefreshProductId,
  getRevenueCatPurchases,
  isRevenueCatAvailable,
} from '@/lib/revenuecat';

import type { PurchasesPackage } from 'react-native-purchases';

export type RefreshOfferingInfo = {
  isConfigured: boolean;
  offeringId: string;
  packageId: string | null;
  priceLabel: string;
  productId: string;
};

type SyncRefreshPurchaseResponse = {
  availableRefreshCount: number;
  paymentId: string;
  refreshGrantId: string;
};

async function getRefreshPackage(userId: string): Promise<PurchasesPackage | null> {
  const isConfigured = await configureRevenueCat(userId);

  if (!isConfigured) {
    return null;
  }

  const PurchasesClient = await getRevenueCatPurchases();
  const offerings = await PurchasesClient.getOfferings();
  const offeringId = getRefreshOfferingId();
  const productId = getRefreshProductId();
  const offering = offerings.all[offeringId] ?? offerings.current;

  if (!offering) {
    return null;
  }

  return (
    offering.availablePackages.find((item) => item.product.identifier === productId) ??
    offering.availablePackages[0] ??
    null
  );
}

export async function getRefreshOfferingInfo(userId: string): Promise<RefreshOfferingInfo> {
  const offeringId = getRefreshOfferingId();
  const productId = getRefreshProductId();

  if (!isRevenueCatAvailable()) {
    return {
      isConfigured: false,
      offeringId,
      packageId: null,
      priceLabel: '스토어 상품 설정 전',
      productId,
    };
  }

  const refreshPackage = await getRefreshPackage(userId);

  return {
    isConfigured: Boolean(refreshPackage),
    offeringId,
    packageId: refreshPackage?.identifier ?? null,
    priceLabel: refreshPackage?.product.priceString ?? '스토어 가격 확인 후 표시',
    productId: refreshPackage?.product.identifier ?? productId,
  };
}

export function isRevenueCatPurchaseCancelled(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; userCancelled?: boolean | null };
  return maybeError.userCancelled === true || maybeError.code === '1';
}

export async function purchaseRefreshItem(userId: string): Promise<SyncRefreshPurchaseResponse> {
  const refreshPackage = await getRefreshPackage(userId);

  if (!refreshPackage) {
    throw new Error('RevenueCat refresh offering is not configured.');
  }

  const PurchasesClient = await getRevenueCatPurchases();
  const purchaseResult = await PurchasesClient.purchasePackage(refreshPackage);
  const matchingTransactions = purchaseResult.customerInfo.nonSubscriptionTransactions.filter(
    (transaction) => transaction.productIdentifier === refreshPackage.product.identifier,
  );
  const latestTransaction = matchingTransactions.at(-1);
  const transactionId = latestTransaction?.transactionIdentifier;

  if (!transactionId) {
    throw new Error('RevenueCat purchase completed without a transaction identifier.');
  }

  const { data, error } = await supabase.functions.invoke<SyncRefreshPurchaseResponse>(
    'sync-refresh-purchase',
    {
      body: {
        currency: refreshPackage.product.currencyCode,
        offeringId: getRefreshOfferingId(),
        packageId: refreshPackage.identifier,
        priceAmount: refreshPackage.product.price,
        productId: refreshPackage.product.identifier,
        purchaseDate: latestTransaction?.purchaseDate ?? null,
        transactionId,
      },
    },
  );

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'paid-refresh', action: 'sync-refresh-purchase' },
      extra: {
        productId: refreshPackage.product.identifier,
        transactionId,
      },
    });
    throw error;
  }

  if (!data) {
    throw new Error('Refresh purchase sync returned no data.');
  }

  return data;
}

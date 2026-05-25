import { logger } from '@dei/shared';
import { Platform } from 'react-native';

import type Purchases from 'react-native-purchases';

type PurchasesModule = typeof Purchases;

let purchasesModule: PurchasesModule | null = null;
let configuredApiKey: string | null = null;
let configuredAppUserId: string | null = null;
let configurePromise: Promise<boolean> | null = null;

export type RevenueCatPlatform = typeof Platform.OS;

export function getRevenueCatApiKey(platform: RevenueCatPlatform = Platform.OS) {
  if (platform === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || null;
  }

  if (platform === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || null;
  }

  return null;
}

export function getRefreshOfferingId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_REFRESH_OFFERING_ID?.trim() || 'refresh';
}

export function getRefreshProductId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_REFRESH_PRODUCT_ID?.trim() || 'dei_refresh_1';
}

export function getHeartOfferingId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_HEART_OFFERING_ID?.trim() || 'heart';
}

export function getHeartProductId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_HEART_PRODUCT_ID?.trim() || 'dei_heart_1';
}

// 새 도메인 (rooms-pivot) 부스터 product — D11 즉시 재매칭 부스터.
// RevenueCat 콘솔에서 product id 변경 가능하도록 환경변수로 분리.
export function getBoosterOfferingId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_BOOSTER_OFFERING_ID?.trim() || 'booster';
}

export function getBoosterProductId() {
  return (
    process.env.EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID?.trim()
    || 'booster_instant_rematch_v1'
  );
}

export function isRevenueCatAvailable() {
  return Boolean(getRevenueCatApiKey()) && Platform.OS !== 'web';
}

async function loadPurchases() {
  if (Platform.OS === 'web') {
    throw new Error('RevenueCat mobile SDK is not available on web.');
  }

  if (!purchasesModule) {
    purchasesModule = (await import('react-native-purchases')).default;
  }

  return purchasesModule;
}

export async function getRevenueCatPurchases() {
  return loadPurchases();
}

export async function configureRevenueCat(appUserId?: string | null) {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    return false;
  }

  const normalizedAppUserId = appUserId?.trim() || null;

  if (configuredApiKey === apiKey) {
    if (normalizedAppUserId && configuredAppUserId !== normalizedAppUserId) {
      try {
        const PurchasesClient = await loadPurchases();
        await PurchasesClient.logIn(normalizedAppUserId);
        configuredAppUserId = normalizedAppUserId;
      } catch (error) {
        logger.captureException(error, {
          tags: { feature: 'revenuecat', action: 'login' },
        });
        throw error;
      }
    }

    return true;
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      const PurchasesClient = await loadPurchases();

      if (__DEV__) {
        await PurchasesClient.setLogLevel(PurchasesClient.LOG_LEVEL.DEBUG);
      }

      PurchasesClient.configure({
        apiKey,
        appUserID: normalizedAppUserId ?? undefined,
      });

      configuredApiKey = apiKey;
      configuredAppUserId = normalizedAppUserId;

      return true;
    })().catch((error) => {
      configurePromise = null;
      logger.captureException(error, {
        tags: { feature: 'revenuecat', action: 'configure' },
      });
      throw error;
    });
  }

  return configurePromise;
}

export async function logOutRevenueCat() {
  if (!configuredApiKey) {
    return;
  }

  try {
    const PurchasesClient = await loadPurchases();

    if (!(await PurchasesClient.isAnonymous())) {
      await PurchasesClient.logOut();
    }

    configuredAppUserId = null;
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'revenuecat', action: 'logout' },
    });
  }
}

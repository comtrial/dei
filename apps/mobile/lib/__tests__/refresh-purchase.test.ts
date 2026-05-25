import type {
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/lib/revenuecat', () => ({
  configureRevenueCat: vi.fn(),
  getHeartOfferingId: vi.fn(),
  getHeartProductId: vi.fn(),
  getRefreshOfferingId: vi.fn(),
  getRefreshProductId: vi.fn(),
  getRevenueCatPurchases: vi.fn(),
  isRevenueCatAvailable: vi.fn(),
}));

import {
  findConsumablePackageInOfferings,
  findPackageByProductId,
} from '../refresh-purchase';

function makePackage(productId: string): PurchasesPackage {
  return {
    identifier: `$rc_package_${productId}`,
    product: {
      identifier: productId,
    },
  } as PurchasesPackage;
}

function makeOffering(packages: PurchasesPackage[]): PurchasesOffering {
  return {
    availablePackages: packages,
  } as PurchasesOffering;
}

describe('findPackageByProductId', () => {
  it('returns only the package with the exact requested product id', () => {
    const refreshPackage = makePackage('dei_refresh_1');
    const heartPackage = makePackage('dei_heart_1');

    expect(
      findPackageByProductId([refreshPackage, heartPackage], 'dei_heart_1'),
    ).toBe(heartPackage);
  });

  it('does not fall back to the first package when the product id is absent', () => {
    expect(
      findPackageByProductId([makePackage('dei_refresh_1')], 'dei_heart_1'),
    ).toBeNull();
  });
});

describe('findConsumablePackageInOfferings', () => {
  it('falls back to current offering but still requires the exact product id', () => {
    const refreshPackage = makePackage('dei_refresh_1');
    const heartPackage = makePackage('dei_heart_1');
    const offerings = {
      all: {},
      current: makeOffering([refreshPackage, heartPackage]),
    } as PurchasesOfferings;

    expect(
      findConsumablePackageInOfferings(offerings, {
        offeringId: 'heart',
        productId: 'dei_heart_1',
      }),
    ).toBe(heartPackage);
  });

  it('does not fall back to an unrelated current offering package', () => {
    const offerings = {
      all: {},
      current: makeOffering([makePackage('dei_refresh_1')]),
    } as PurchasesOfferings;

    expect(
      findConsumablePackageInOfferings(offerings, {
        offeringId: 'heart',
        productId: 'dei_heart_1',
      }),
    ).toBeNull();
  });
});

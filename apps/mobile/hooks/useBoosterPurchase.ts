/**
 * useBoosterPurchase — D11 부스터 구매/사용 흐름.
 *
 * 여성 사용자: 무료 grant 자동 발급 (`grantFreeBoosterForFemale`) → consume.
 * 남성 사용자: RevenueCat 구매 → `booster-purchase-sync` Edge 로 grant 적재 → consume.
 *
 * 클라는 단순히 `purchaseAndConsume()` 한 번 호출하면 됨. 성별 분기는 hook 내부.
 */
import { logger } from '@dei/shared';
import { useCallback, useState } from 'react';

import {
  consumeBoosterGrant,
  grantFreeBoosterForFemale,
  syncBoosterPurchase,
} from '@/lib/booster/booster-service';
import { isLocalDevPaymentEnabled } from '@/lib/dev-auth';
import { getBoosterOfferingId, getBoosterProductId, isRevenueCatAvailable } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';

export type BoosterPurchaseStep =
  | 'idle'
  | 'granting-free'      // 여성: 무료 grant 발급 중
  | 'purchasing'         // 남성: RevenueCat 결제 진행 중
  | 'syncing'            // 영수증 → grant 적재 중
  | 'consuming'          // grant 소비 중
  | 'done'
  | 'error';

export type BoosterPurchaseResult =
  | { ok: true; grantId: string }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'no-cooldown' | 'rc-error' | 'sync-error' | 'consume-error'; error?: unknown };

async function fetchProfileGender(): Promise<'M' | 'F' | 'other' | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('gender')
    .maybeSingle();
  if (error || !data?.gender) return null;
  const g = data.gender;
  if (g === 'M' || g === 'F' || g === 'other') return g;
  return null;
}

export function useBoosterPurchase() {
  const [step, setStep] = useState<BoosterPurchaseStep>('idle');

  const purchaseAndConsume = useCallback(async (): Promise<BoosterPurchaseResult> => {
    setStep('idle');

    const gender = await fetchProfileGender();
    if (!gender) {
      setStep('error');
      return { ok: false, reason: 'unavailable' };
    }

    // ============================================================
    // 1) 여성 — 무료 grant 자동 발급
    // ============================================================
    if (gender === 'F') {
      setStep('granting-free');
      try {
        await grantFreeBoosterForFemale();
      } catch (e) {
        logger.captureException(e, {
          tags: { feature: 'booster', action: 'grant-free-step' },
        });
        setStep('error');
        const message = e instanceof Error ? e.message : '';
        if (message.includes('cooldown')) {
          return { ok: false, reason: 'no-cooldown', error: e };
        }
        return { ok: false, reason: 'sync-error', error: e };
      }
    } else {
      // ============================================================
      // 2) 남성 (또는 other) — RevenueCat 결제
      // ============================================================
      if (!isRevenueCatAvailable() && !isLocalDevPaymentEnabled()) {
        setStep('error');
        return { ok: false, reason: 'unavailable' };
      }

      setStep('purchasing');
      let transactionId: string;
      try {
        if (isLocalDevPaymentEnabled()) {
          // dev 시뮬레이션: 가짜 transaction id
          transactionId = `dev-booster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        } else {
          const { getRevenueCatPurchases } = await import('@/lib/revenuecat');
          const Purchases = await getRevenueCatPurchases();
          const offerings = await Purchases.getOfferings();
          const targetOfferingId = getBoosterOfferingId();
          const productId = getBoosterProductId();
          const offering =
            offerings.all[targetOfferingId] ?? offerings.current;
          const pkg = offering?.availablePackages.find(
            (p) => p.product.identifier === productId,
          );
          if (!pkg) {
            setStep('error');
            return { ok: false, reason: 'unavailable' };
          }
          const result = await Purchases.purchasePackage(pkg);
          const txn = result.customerInfo.nonSubscriptionTransactions.find(
            (t) => t.productIdentifier === productId,
          );
          if (!txn) {
            setStep('error');
            return { ok: false, reason: 'rc-error' };
          }
          transactionId = txn.transactionIdentifier;
        }
      } catch (e) {
        logger.captureException(e, {
          tags: { feature: 'booster', action: 'rc-purchase' },
        });
        setStep('error');
        const message = e instanceof Error ? e.message : '';
        if (message.toLowerCase().includes('cancel')) {
          return { ok: false, reason: 'cancelled', error: e };
        }
        return { ok: false, reason: 'rc-error', error: e };
      }

      setStep('syncing');
      try {
        await syncBoosterPurchase({
          productId: getBoosterProductId(),
          transactionId,
        });
      } catch (e) {
        logger.captureException(e, {
          tags: { feature: 'booster', action: 'sync' },
        });
        setStep('error');
        return { ok: false, reason: 'sync-error', error: e };
      }
    }

    // ============================================================
    // 3) 공통 — grant 소비
    // ============================================================
    setStep('consuming');
    try {
      const result = await consumeBoosterGrant();
      setStep('done');
      return { ok: true, grantId: result.grantId };
    } catch (e) {
      logger.captureException(e, {
        tags: { feature: 'booster', action: 'consume' },
      });
      setStep('error');
      return { ok: false, reason: 'consume-error', error: e };
    }
  }, []);

  return { step, purchaseAndConsume };
}

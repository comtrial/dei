/**
 * Booster (즉시 재매칭) 도메인 service.
 *
 * 흐름:
 *   1) `room_leave_cooldowns` 가 있고 사용자가 여성 → grantFreeBoosterForFemale
 *   2) 남성 → RevenueCat 결제 → booster-purchase-sync 로 grant 적재
 *   3) 양쪽 모두 consume → consume_booster_grant Edge 호출
 */
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

type EdgeError = { error?: string; retryable?: boolean };

function unwrapEdgeError(err: unknown, fallback: string): Error & { retryable?: boolean } {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; context?: { json?: EdgeError } };
    const detail = e.context?.json?.error;
    const final = new Error(detail || e.message || fallback);
    (final as { retryable?: boolean }).retryable = e.context?.json?.retryable;
    return final;
  }
  return new Error(fallback);
}

export async function grantFreeBoosterForFemale(): Promise<{ grantId: string }> {
  const { data, error } = await supabase.functions.invoke<{ grantId: string }>(
    'booster-grant-free-female',
    { body: {} },
  );
  if (error || !data?.grantId) {
    const captured = unwrapEdgeError(error, 'failed to grant free booster');
    logger.captureException(captured, {
      tags: { feature: 'booster', action: 'grant-free-female' },
    });
    throw captured;
  }
  return data;
}

export async function syncBoosterPurchase(input: {
  productId: string;
  transactionId: string;
}): Promise<{ grantId: string; alreadyExists?: boolean }> {
  const { data, error } = await supabase.functions.invoke<{
    grantId: string;
    alreadyExists?: boolean;
  }>('booster-purchase-sync', { body: input });
  if (error || !data?.grantId) {
    const captured = unwrapEdgeError(error, 'failed to sync booster purchase');
    logger.captureException(captured, {
      tags: { feature: 'booster', action: 'sync-purchase' },
      extra: { productId: input.productId },
    });
    throw captured;
  }
  return data;
}

export async function consumeBoosterGrant(): Promise<{ grantId: string }> {
  const { data, error } = await supabase.functions.invoke<{ grantId: string }>(
    'booster-consume',
    { body: {} },
  );
  if (error || !data?.grantId) {
    const captured = unwrapEdgeError(error, 'failed to consume booster');
    logger.captureException(captured, {
      tags: { feature: 'booster', action: 'consume' },
    });
    throw captured;
  }
  return data;
}

// ============================================================================
// Read — cooldown 잔여 + 사용 가능한 booster 1건 여부
// ============================================================================

export type CooldownStatus = {
  /** ISO 시각. null 이면 cooldown 없음 (자유 재매칭 가능). */
  cooldownUntil: string | null;
  /** cooldown 종료까지 남은 ms (음수면 만료) */
  remainingMs: number;
};

export async function fetchMyCooldown(): Promise<CooldownStatus> {
  const { data, error } = await supabase
    .from('room_leave_cooldowns')
    .select('cooldown_until')
    .maybeSingle();

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'booster', action: 'fetch-cooldown' },
    });
    return { cooldownUntil: null, remainingMs: 0 };
  }

  if (!data) return { cooldownUntil: null, remainingMs: 0 };

  const until = data.cooldown_until;
  const remaining = new Date(until).getTime() - Date.now();
  return { cooldownUntil: until, remainingMs: remaining };
}

export async function fetchAvailableBoosterCount(): Promise<number> {
  const { count, error } = await supabase
    .from('booster_grants')
    .select('id', { count: 'exact', head: true })
    .is('consumed_at', null);

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'booster', action: 'fetch-available' },
    });
    return 0;
  }
  return count ?? 0;
}

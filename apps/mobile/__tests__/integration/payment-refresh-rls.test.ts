/**
 * Paid refresh payment foundation integration tests.
 *
 * These tests need a local Supabase service-role key because grant/consume
 * helpers are intentionally server-only. Without the key, they skip so the
 * regular app test run remains lightweight.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

let reachable = false;
const hasRequiredServiceRoleKey = hasServiceRoleKey();

const uniqueId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;

beforeAll(async () => {
  if (!process.env.RUN_INTEGRATION || !hasRequiredServiceRoleKey) {
    return;
  }

  reachable = await isSupabaseReachable();
  if (!reachable) {
    throw new Error('Local Supabase is not reachable. Start it with `pnpm db:start`.');
  }
});

describe.skipIf(!process.env.RUN_INTEGRATION || !hasRequiredServiceRoleKey)(
  'paid refresh payment foundation (local)',
  () => {
    it('grants exactly one refresh item per payment even when called twice', async () => {
      const client = makeServiceClient();
      const email = `paid-refresh-${uniqueId()}@example.test`;

      const { data: userResult, error: createUserError } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      expect(createUserError).toBeNull();

      const userId = userResult.user?.id;
      expect(userId).toBeTruthy();

      try {
        const { data: payment, error: paymentError } = await client
          .from('payments')
          .insert({
            user_id: userId,
            product_type: 'REFRESH',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_refresh_1',
            revenuecat_transaction_id: `test-${uniqueId()}`,
          })
          .select('id')
          .single();

        expect(paymentError).toBeNull();
        expect(payment?.id).toBeTruthy();

        const firstGrant = await client.rpc('grant_refresh_item', {
          p_user_id: userId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(firstGrant.error).toBeNull();
        expect(firstGrant.data?.id).toBeTruthy();

        const secondGrant = await client.rpc('grant_refresh_item', {
          p_user_id: userId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(secondGrant.error).toBeNull();
        expect(secondGrant.data?.id).toBe(firstGrant.data?.id);

        const availableCount = await client.rpc('get_available_refresh_item_count', {
          p_user_id: userId,
        });
        expect(availableCount.error).toBeNull();
        expect(availableCount.data).toBe(1);
      } finally {
        if (userId) {
          await client.auth.admin.deleteUser(userId);
        }
      }
    });

    it('does not consume a refresh grant unless the redemption has exactly 3 candidates', async () => {
      const client = makeServiceClient();
      const email = `paid-refresh-guard-${uniqueId()}@example.test`;

      const { data: userResult, error: createUserError } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      expect(createUserError).toBeNull();

      const userId = userResult.user?.id;
      expect(userId).toBeTruthy();

      try {
        const { data: payment, error: paymentError } = await client
          .from('payments')
          .insert({
            user_id: userId,
            product_type: 'REFRESH',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_refresh_1',
            revenuecat_transaction_id: `test-${uniqueId()}`,
          })
          .select('id')
          .single();

        expect(paymentError).toBeNull();

        const grant = await client.rpc('grant_refresh_item', {
          p_user_id: userId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(grant.error).toBeNull();

        const invalidRedemption = await client.rpc('record_refresh_redemption', {
          p_user_id: userId,
          p_grant_id: grant.data?.id,
          p_seen_user_ids: [],
          p_candidate_user_ids: [uniqueId(), uniqueId()],
          p_status: 'SUCCESS',
          p_failure_reason: null,
        });
        expect(invalidRedemption.error?.message).toContain('exactly 3 candidates');

        const countAfterInvalidAttempt = await client.rpc('get_available_refresh_item_count', {
          p_user_id: userId,
        });
        expect(countAfterInvalidAttempt.error).toBeNull();
        expect(countAfterInvalidAttempt.data).toBe(1);

        const validRedemption = await client.rpc('record_refresh_redemption', {
          p_user_id: userId,
          p_grant_id: grant.data?.id,
          p_seen_user_ids: [],
          p_candidate_user_ids: [uniqueId(), uniqueId(), uniqueId()],
          p_status: 'SUCCESS',
          p_failure_reason: null,
        });
        expect(validRedemption.error).toBeNull();
        expect(validRedemption.data?.candidate_user_ids).toHaveLength(3);

        const countAfterValidAttempt = await client.rpc('get_available_refresh_item_count', {
          p_user_id: userId,
        });
        expect(countAfterValidAttempt.error).toBeNull();
        expect(countAfterValidAttempt.data).toBe(0);
      } finally {
        if (userId) {
          await client.auth.admin.deleteUser(userId);
        }
      }
    });
  },
);

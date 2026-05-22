/**
 * Paid refresh payment foundation integration tests.
 *
 * These tests need a local Supabase service-role key because grant/consume
 * helpers are intentionally server-only. Without the key, they skip so the
 * regular app test run remains lightweight.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { hasServiceRoleKey, isSupabaseReachable, makeAnonClient, makeServiceClient } from './setup';

let reachable = false;
const hasRequiredServiceRoleKey = hasServiceRoleKey();

const uniqueId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;

const effectivePoolDate = () => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < 12) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
};

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

    it('keeps refresh tickets separate from like hearts', async () => {
      const client = makeServiceClient();
      const email = `paid-consumable-split-${uniqueId()}@example.test`;

      const { data: userResult, error: createUserError } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      expect(createUserError).toBeNull();

      const userId = userResult.user?.id;
      expect(userId).toBeTruthy();

      try {
        const { data: refreshPayment, error: refreshPaymentError } = await client
          .from('payments')
          .insert({
            user_id: userId,
            product_type: 'REFRESH',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_refresh_1',
            revenuecat_transaction_id: `refresh-${uniqueId()}`,
          })
          .select('id')
          .single();
        expect(refreshPaymentError).toBeNull();

        const { data: heartPayment, error: heartPaymentError } = await client
          .from('payments')
          .insert({
            user_id: userId,
            product_type: 'HEART',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_heart_1',
            revenuecat_transaction_id: `heart-${uniqueId()}`,
          })
          .select('id')
          .single();
        expect(heartPaymentError).toBeNull();

        const refreshGrant = await client.rpc('grant_refresh_item', {
          p_user_id: userId,
          p_payment_id: refreshPayment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(refreshGrant.error).toBeNull();

        const heartGrant = await client.rpc('grant_refresh_item', {
          p_user_id: userId,
          p_payment_id: heartPayment?.id,
          p_product_id: 'dei_heart_1',
          p_granted_count: 1,
        });
        expect(heartGrant.error).toBeNull();

        const refreshCount = await client.rpc('get_available_refresh_item_count', {
          p_user_id: userId,
        });
        expect(refreshCount.error).toBeNull();
        expect(refreshCount.data).toBe(1);

        const heartCount = await client.rpc('get_available_heart_count', {
          p_user_id: userId,
        });
        expect(heartCount.error).toBeNull();
        expect(heartCount.data).toBe(1);
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

    it('keeps the refresh ticket when fewer than 3 distinct people are available', async () => {
      const service = makeServiceClient();
      const viewerEmail = `paid-refresh-distinct-viewer-${uniqueId()}@example.test`;
      const targetEmail = `paid-refresh-distinct-target-${uniqueId()}@example.test`;
      const password = 'Password123!';

      const { data: viewerResult, error: createViewerError } =
        await service.auth.admin.createUser({
          email: viewerEmail,
          password,
          email_confirm: true,
        });
      expect(createViewerError).toBeNull();

      const { data: targetResult, error: createTargetError } =
        await service.auth.admin.createUser({
          email: targetEmail,
          email_confirm: true,
        });
      expect(createTargetError).toBeNull();

      const viewerId = viewerResult.user?.id;
      const targetId = targetResult.user?.id;
      expect(viewerId).toBeTruthy();
      expect(targetId).toBeTruthy();

      try {
        const profiles = await service.from('profiles').upsert([
          {
            user_id: viewerId,
            nickname: 'viewer',
            gender: 'F',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
          {
            user_id: targetId,
            nickname: 'target',
            gender: 'M',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
        ], { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const { data: logs, error: logsError } = await service
          .from('logs')
          .insert([8, 9, 10].map((hour) => ({
            user_id: targetId,
            video_url: `${targetId}/${hour}.mp4`,
            hour_slot: hour,
            duration_sec: 2,
            '검수_YN': 'Y',
            '검수_상태': 'APPROVED',
            recorded_at: new Date().toISOString(),
          })))
          .select('id, video_url');
        expect(logsError).toBeNull();
        expect(logs).toHaveLength(3);

        const poolDate = effectivePoolDate();
        const pool = await service.from('curation_pool').insert(
          (logs ?? []).map((log) => ({
            user_id: targetId,
            log_id: log.id,
            pool_date: poolDate,
            '검수_YN': 'Y',
            '차단_YN': 'N',
            video_path: log.video_url,
          })),
        );
        expect(pool.error).toBeNull();

        const { data: payment, error: paymentError } = await service
          .from('payments')
          .insert({
            user_id: viewerId,
            product_type: 'REFRESH',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_refresh_1',
            revenuecat_transaction_id: `distinct-${uniqueId()}`,
          })
          .select('id')
          .single();
        expect(paymentError).toBeNull();

        const grant = await service.rpc('grant_refresh_item', {
          p_user_id: viewerId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(grant.error).toBeNull();

        const viewerClient = makeAnonClient();
        const signIn = await viewerClient.auth.signInWithPassword({
          email: viewerEmail,
          password,
        });
        expect(signIn.error).toBeNull();

        const consume = await viewerClient.rpc('consume_refresh_item', {
          p_seen_user_ids: [],
        });
        expect(consume.error).toBeNull();
        expect(consume.data).toHaveLength(0);

        const countAfterAttempt = await service.rpc('get_available_refresh_item_count', {
          p_user_id: viewerId,
        });
        expect(countAfterAttempt.error).toBeNull();
        expect(countAfterAttempt.data).toBe(1);

        const redemptions = await service
          .from('refresh_redemptions')
          .select('status, failure_reason, candidate_user_ids, grant_id')
          .eq('user_id', viewerId);
        expect(redemptions.error).toBeNull();
        expect(redemptions.data).toEqual([
          {
            status: 'FAILED',
            failure_reason: 'NO_CANDIDATES',
            candidate_user_ids: [],
            grant_id: grant.data?.id,
          },
        ]);
      } finally {
        if (viewerId) {
          await service.auth.admin.deleteUser(viewerId);
        }
        if (targetId) {
          await service.auth.admin.deleteUser(targetId);
        }
      }
    });

    it('excludes blocked profiles from paid refresh candidates and keeps the ticket', async () => {
      const service = makeServiceClient();
      const password = 'Password123!';
      const viewerEmail = `paid-refresh-block-viewer-${uniqueId()}@example.test`;
      const targetEmails = [0, 1, 2].map(
        (index) => `paid-refresh-block-target-${index}-${uniqueId()}@example.test`
      );

      const { data: viewerResult, error: createViewerError } =
        await service.auth.admin.createUser({
          email: viewerEmail,
          password,
          email_confirm: true,
        });
      expect(createViewerError).toBeNull();

      const targetResults = await Promise.all(
        targetEmails.map((email) =>
          service.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          })
        )
      );
      for (const result of targetResults) {
        expect(result.error).toBeNull();
      }

      const viewerId = viewerResult.user?.id;
      const targetIds = targetResults
        .map((result) => result.data.user?.id)
        .filter((targetId): targetId is string => Boolean(targetId));
      expect(viewerId).toBeTruthy();
      expect(targetIds).toHaveLength(3);

      try {
        const profiles = await service.from('profiles').upsert([
          {
            user_id: viewerId,
            nickname: 'viewer',
            gender: 'F',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
          ...targetIds.map((targetId, index) => ({
            user_id: targetId,
            nickname: `target-${index}`,
            gender: 'M',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          })),
        ], { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const poolDate = effectivePoolDate();
        for (const [index, targetId] of targetIds.entries()) {
          const { data: log, error: logError } = await service
            .from('logs')
            .insert({
              user_id: targetId,
              video_url: `${targetId}/approved.mp4`,
              hour_slot: index + 8,
              duration_sec: 2,
              '검수_YN': 'Y',
              '검수_상태': 'APPROVED',
              recorded_at: new Date().toISOString(),
            })
            .select('id, video_url')
            .single();
          expect(logError).toBeNull();

          const pool = await service.from('curation_pool').insert({
            user_id: targetId,
            log_id: log?.id,
            pool_date: poolDate,
            '검수_YN': 'Y',
            '차단_YN': 'N',
            video_path: log?.video_url,
          });
          expect(pool.error).toBeNull();
        }

        const viewerClient = makeAnonClient();
        const signIn = await viewerClient.auth.signInWithPassword({
          email: viewerEmail,
          password,
        });
        expect(signIn.error).toBeNull();

        const block = await viewerClient.rpc('block_profile_user', {
          p_blocked_user_id: targetIds[0],
          p_reason: 'curation refresh test',
        });
        expect(block.error).toBeNull();

        const { data: payment, error: paymentError } = await service
          .from('payments')
          .insert({
            user_id: viewerId,
            product_type: 'REFRESH',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_refresh_1',
            revenuecat_transaction_id: `blocked-${uniqueId()}`,
          })
          .select('id')
          .single();
        expect(paymentError).toBeNull();

        const grant = await service.rpc('grant_refresh_item', {
          p_user_id: viewerId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_refresh_1',
          p_granted_count: 1,
        });
        expect(grant.error).toBeNull();

        const consume = await viewerClient.rpc('consume_refresh_item', {
          p_seen_user_ids: [],
        });
        expect(consume.error).toBeNull();
        expect(consume.data).toHaveLength(0);

        const countAfterAttempt = await service.rpc('get_available_refresh_item_count', {
          p_user_id: viewerId,
        });
        expect(countAfterAttempt.error).toBeNull();
        expect(countAfterAttempt.data).toBe(1);
      } finally {
        if (viewerId) {
          await service.auth.admin.deleteUser(viewerId);
        }
        for (const targetId of targetIds) {
          await service.auth.admin.deleteUser(targetId);
        }
      }
    });
  },
);

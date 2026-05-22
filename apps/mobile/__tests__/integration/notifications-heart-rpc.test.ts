/**
 * Notification + heart-backed like integration tests.
 *
 * These run only against local Supabase with a service-role key. They verify
 * the DB trigger/RPC contract that component tests cannot cover.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  hasServiceRoleKey,
  isSupabaseReachable,
  makeAnonClient,
  makeServiceClient,
} from './setup';

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
  'notifications and paid hearts (local)',
  () => {
    it('registers push tokens, creates like notifications, and consumes one heart after the free like', async () => {
      const service = makeServiceClient();
      const password = 'Password1234!';
      const senderEmail = `heart-sender-${uniqueId()}@example.test`;
      const targetOneEmail = `heart-target-one-${uniqueId()}@example.test`;
      const targetTwoEmail = `heart-target-two-${uniqueId()}@example.test`;

      const { data: senderResult, error: senderCreateError } =
        await service.auth.admin.createUser({
          email: senderEmail,
          email_confirm: true,
          password,
        });
      expect(senderCreateError).toBeNull();

      const { data: targetOneResult, error: targetOneCreateError } =
        await service.auth.admin.createUser({
          email: targetOneEmail,
          email_confirm: true,
          password,
        });
      expect(targetOneCreateError).toBeNull();

      const { data: targetTwoResult, error: targetTwoCreateError } =
        await service.auth.admin.createUser({
          email: targetTwoEmail,
          email_confirm: true,
          password,
        });
      expect(targetTwoCreateError).toBeNull();

      const senderId = senderResult.user?.id;
      const targetOneId = targetOneResult.user?.id;
      const targetTwoId = targetTwoResult.user?.id;
      expect(senderId).toBeTruthy();
      expect(targetOneId).toBeTruthy();
      expect(targetTwoId).toBeTruthy();

      try {
        const profiles = await service.from('profiles').upsert([
          {
            user_id: senderId,
            nickname: 'sender',
            gender: 'F',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
          {
            user_id: targetOneId,
            nickname: 'target-one',
            gender: 'M',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
          {
            user_id: targetTwoId,
            nickname: 'target-two',
            gender: 'M',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
        ], { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const log = await service.from('logs').insert({
          user_id: senderId,
          video_url: `${senderId}/approved.mp4`,
          hour_slot: 8,
          duration_sec: 2,
          '검수_YN': 'Y',
          '검수_상태': 'APPROVED',
          recorded_at: new Date().toISOString(),
        });
        expect(log.error).toBeNull();

        const { data: payment, error: paymentError } = await service
          .from('payments')
          .insert({
            user_id: senderId,
            product_type: 'HEART',
            amount: 1000,
            currency: 'KRW',
            '결제상태': 'SUCCESS',
            provider: 'revenuecat',
            product_id: 'dei_heart_1',
            revenuecat_transaction_id: `test-${uniqueId()}`,
          })
          .select('id')
          .single();
        expect(paymentError).toBeNull();

        const grant = await service.rpc('grant_refresh_item', {
          p_user_id: senderId,
          p_payment_id: payment?.id,
          p_product_id: 'dei_heart_1',
          p_granted_count: 1,
        });
        expect(grant.error).toBeNull();

        const senderClient = makeAnonClient();
        const signIn = await senderClient.auth.signInWithPassword({
          email: senderEmail,
          password,
        });
        expect(signIn.error).toBeNull();

        const sharedPushToken = `ExponentPushToken[${uniqueId()}]`;
        const push = await senderClient.rpc('register_user_push_token', {
          p_app_version: 'integration-test',
          p_device_label: 'vitest',
          p_installation_id_hash: `integration-${uniqueId()}`,
          p_platform: 'ios',
          p_push_provider: 'expo',
          p_push_token: sharedPushToken,
        });
        expect(push.error).toBeNull();
        expect(push.data?.push_token).toContain('ExponentPushToken');

        const targetClient = makeAnonClient();
        const targetSignIn = await targetClient.auth.signInWithPassword({
          email: targetOneEmail,
          password,
        });
        expect(targetSignIn.error).toBeNull();

        const movedPush = await targetClient.rpc('register_user_push_token', {
          p_app_version: 'integration-test',
          p_device_label: 'vitest',
          p_installation_id_hash: `integration-${uniqueId()}`,
          p_platform: 'ios',
          p_push_provider: 'expo',
          p_push_token: sharedPushToken,
        });
        expect(movedPush.error).toBeNull();

        const senderDevice = await service
          .from('user_devices')
          .select('revoked_at')
          .eq('id', push.data?.id)
          .single();
        expect(senderDevice.error).toBeNull();
        expect(senderDevice.data?.revoked_at).toBeTruthy();

        const freeLike = await senderClient.rpc('send_like', {
          p_attached_log_id: null,
          p_to_user_id: targetOneId,
        });
        expect(freeLike.error).toBeNull();

        const countAfterFreeLike = await service.rpc('get_available_heart_count', {
          p_user_id: senderId,
        });
        expect(countAfterFreeLike.error).toBeNull();
        expect(countAfterFreeLike.data).toBe(1);

        const heartLike = await senderClient.rpc('send_like', {
          p_attached_log_id: null,
          p_to_user_id: targetTwoId,
        });
        expect(heartLike.error).toBeNull();

        const countAfterHeartLike = await service.rpc('get_available_heart_count', {
          p_user_id: senderId,
        });
        expect(countAfterHeartLike.error).toBeNull();
        expect(countAfterHeartLike.data).toBe(0);

        const notification = await service
          .from('notifications')
          .select('type, user_id, route, read_at, metadata')
          .eq('user_id', targetTwoId)
          .eq('type', 'like_received')
          .single();
        expect(notification.error).toBeNull();
        expect(notification.data).toMatchObject({
          read_at: null,
          route: '/likes?tab=received',
          type: 'like_received',
          user_id: targetTwoId,
        });
        expect(notification.data?.metadata).toMatchObject({
          fromUserId: senderId,
        });

        const firstPaymentNotification = await service.rpc('create_notification', {
          p_body: '하트가 충전됐어요.',
          p_dedupe_key: `payment:${payment?.id}:success`,
          p_metadata: { paymentId: payment?.id },
          p_route: '/home',
          p_title: '하트가 충전됐어요',
          p_type: 'payment_succeeded',
          p_user_id: senderId,
        });
        expect(firstPaymentNotification.error).toBeNull();

        const secondPaymentNotification = await service.rpc('create_notification', {
          p_body: '하트가 충전됐어요.',
          p_dedupe_key: `payment:${payment?.id}:success`,
          p_metadata: { paymentId: payment?.id },
          p_route: '/home',
          p_title: '하트가 충전됐어요',
          p_type: 'payment_succeeded',
          p_user_id: senderId,
        });
        expect(secondPaymentNotification.error).toBeNull();
        expect(secondPaymentNotification.data).toBe(firstPaymentNotification.data);
      } finally {
        if (senderId) await service.auth.admin.deleteUser(senderId);
        if (targetOneId) await service.auth.admin.deleteUser(targetOneId);
        if (targetTwoId) await service.auth.admin.deleteUser(targetTwoId);
      }
    });
  },
);

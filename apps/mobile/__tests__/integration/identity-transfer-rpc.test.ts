/**
 * Existing-member transfer integration test.
 *
 * This protects the PASS identity verification path where an already-verified
 * profile is moved onto the newly authenticated user after PortOne confirms CI/DI.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  hasServiceRoleKey,
  isSupabaseReachable,
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
  'existing member transfer RPC (local)',
  () => {
    it('moves a profile with likes referenced through profiles(user_id)', async () => {
      const service = makeServiceClient();
      const password = 'Password1234!';
      const sourceEmail = `identity-source-${uniqueId()}@example.test`;
      const targetEmail = `identity-target-${uniqueId()}@example.test`;
      const likedEmail = `identity-liked-${uniqueId()}@example.test`;

      const { data: sourceResult, error: sourceCreateError } =
        await service.auth.admin.createUser({
          email: sourceEmail,
          email_confirm: true,
          password,
        });
      expect(sourceCreateError).toBeNull();

      const { data: targetResult, error: targetCreateError } =
        await service.auth.admin.createUser({
          email: targetEmail,
          email_confirm: true,
          password,
        });
      expect(targetCreateError).toBeNull();

      const { data: likedResult, error: likedCreateError } =
        await service.auth.admin.createUser({
          email: likedEmail,
          email_confirm: true,
          password,
        });
      expect(likedCreateError).toBeNull();

      const sourceId = sourceResult.user?.id;
      const targetId = targetResult.user?.id;
      const likedId = likedResult.user?.id;
      expect(sourceId).toBeTruthy();
      expect(targetId).toBeTruthy();
      expect(likedId).toBeTruthy();

      try {
        const profiles = await service.from('profiles').upsert([
          {
            user_id: sourceId,
            nickname: 'existing-member',
            gender: 'F',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
          {
            user_id: likedId,
            nickname: 'liked-profile',
            gender: 'M',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
        ], { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const account = await service
          .from('account_status')
          .update({
            discovery_enabled_at: new Date().toISOString(),
            first_video_approved_at: new Date().toISOString(),
            identity_verified_at: new Date().toISOString(),
            onboarding_state: 'complete',
            profile_completed_at: new Date().toISOString(),
          })
          .eq('user_id', sourceId);
        expect(account.error).toBeNull();

        const like = await service
          .from('likes')
          .insert({
            from_user_id: sourceId,
            liked_at: new Date().toISOString(),
            to_user_id: likedId,
          })
          .select('id')
          .single();
        expect(like.error).toBeNull();

        const transfer = await service.rpc('transfer_existing_member_account', {
          p_from_user_id: sourceId,
          p_to_user_id: targetId,
        });
        expect(transfer.error).toBeNull();
        expect(transfer.data?.user_id).toBe(targetId);

        const transferredLike = await service
          .from('likes')
          .select('from_user_id, to_user_id')
          .eq('id', like.data?.id)
          .single();
        expect(transferredLike.error).toBeNull();
        expect(transferredLike.data).toEqual({
          from_user_id: targetId,
          to_user_id: likedId,
        });

        const oldProfile = await service
          .from('profiles')
          .select('user_id')
          .eq('user_id', sourceId)
          .maybeSingle();
        expect(oldProfile.error).toBeNull();
        expect(oldProfile.data).toBeNull();
      } finally {
        if (sourceId) await service.auth.admin.deleteUser(sourceId);
        if (targetId) await service.auth.admin.deleteUser(targetId);
        if (likedId) await service.auth.admin.deleteUser(likedId);
      }
    });
  },
);

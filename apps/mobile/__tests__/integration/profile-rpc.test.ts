/**
 * Public profile RPC integration tests.
 *
 * These need local Supabase plus a service-role key. They skip in ordinary
 * test runs so app contributors without Docker are not blocked.
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
  'public profile RPCs (local)',
  () => {
    it('returns limited public profile data, approved logs, reports, and respects blocks', async () => {
      const service = makeServiceClient();
      const password = 'Password1234!';
      const viewerEmail = `profile-viewer-${uniqueId()}@example.test`;
      const targetEmail = `profile-target-${uniqueId()}@example.test`;

      const { data: viewerResult, error: viewerCreateError } =
        await service.auth.admin.createUser({
          email: viewerEmail,
          email_confirm: true,
          password,
        });
      expect(viewerCreateError).toBeNull();

      const { data: targetResult, error: targetCreateError } =
        await service.auth.admin.createUser({
          email: targetEmail,
          email_confirm: true,
          password,
        });
      expect(targetCreateError).toBeNull();

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
            intro: 'hello',
            '회원상태': 'ACTIVE',
            '차단_YN': 'N',
          },
        ], { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const logs = await service.from('logs').insert([
          {
            user_id: targetId,
            video_url: `${targetId}/approved.mp4`,
            hour_slot: 8,
            duration_sec: 2,
            '검수_YN': 'Y',
            '검수_상태': 'APPROVED',
            recorded_at: '2026-05-12T08:00:00.000+09:00',
          },
          {
            user_id: targetId,
            video_url: `${targetId}/pending.mp4`,
            hour_slot: 18,
            duration_sec: 2,
            '검수_YN': 'N',
            '검수_상태': 'PENDING',
            recorded_at: '2026-05-12T18:00:00.000+09:00',
          },
        ]);
        expect(logs.error).toBeNull();

        const viewerClient = makeAnonClient();
        const signIn = await viewerClient.auth.signInWithPassword({
          email: viewerEmail,
          password,
        });
        expect(signIn.error).toBeNull();

        const publicProfile = await viewerClient.rpc('get_public_profile', {
          p_profile_user_id: targetId,
        });
        expect(publicProfile.error).toBeNull();
        expect(publicProfile.data).toHaveLength(1);
        expect(publicProfile.data?.[0]).toMatchObject({
          nickname: 'target',
          profile_user_id: targetId,
        });
        expect(publicProfile.data?.[0]).not.toHaveProperty('phone');

        const publicLogs = await viewerClient.rpc('get_public_profile_logs', {
          p_profile_user_id: targetId,
        });
        expect(publicLogs.error).toBeNull();
        expect(publicLogs.data).toHaveLength(1);
        expect(publicLogs.data?.[0]?.video_url).toContain('approved.mp4');

        const report = await viewerClient.rpc('create_profile_report', {
          p_description: null,
          p_log_id: null,
          p_reason: '프로필 신고',
          p_reason_category: 'OTHER',
          p_reported_id: targetId,
        });
        expect(report.error).toBeNull();
        expect(report.data).toBeTruthy();

        const storedReport = await service
          .from('reports')
          .select('id, reporter_id, reported_id, reason_category')
          .eq('id', report.data)
          .single();
        expect(storedReport.error).toBeNull();
        expect(storedReport.data).toMatchObject({
          reporter_id: viewerId,
          reported_id: targetId,
          reason_category: 'OTHER',
        });

        const block = await viewerClient.rpc('block_profile_user', {
          p_blocked_user_id: targetId,
          p_reason: 'profile screen',
        });
        expect(block.error).toBeNull();

        const blockedProfile = await viewerClient.rpc('get_public_profile', {
          p_profile_user_id: targetId,
        });
        expect(blockedProfile.error).toBeNull();
        expect(blockedProfile.data).toEqual([]);
      } finally {
        if (viewerId) await service.auth.admin.deleteUser(viewerId);
        if (targetId) await service.auth.admin.deleteUser(targetId);
      }
    });
  }
);

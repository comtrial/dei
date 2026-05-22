/**
 * Own log deletion integration test.
 *
 * Runs only against local Supabase with service-role credentials.
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
  'delete own log and recalculate daily log (local)',
  () => {
    it('deletes only the signed-in user log and returns the recalculated day status', async () => {
      const service = makeServiceClient();
      const password = 'Password1234!';
      const email = `log-delete-${uniqueId()}@example.test`;

      const { data: userResult, error: createUserError } =
        await service.auth.admin.createUser({
          email,
          email_confirm: true,
          password,
        });
      expect(createUserError).toBeNull();

      const userId = userResult.user?.id;
      expect(userId).toBeTruthy();

      try {
        const profiles = await service.from('profiles').upsert({
          user_id: userId,
          nickname: 'log-delete-user',
          gender: 'F',
          '회원상태': 'ACTIVE',
          '차단_YN': 'N',
        }, { onConflict: 'user_id' });
        expect(profiles.error).toBeNull();

        const { data: logs, error: logsError } = await service
          .from('logs')
          .insert([
            {
              user_id: userId,
              video_url: `${userId}/morning.mp4`,
              hour_slot: 8,
              duration_sec: 2,
              recorded_at: '2026-05-12T08:00:00.000+09:00',
            },
            {
              user_id: userId,
              video_url: `${userId}/evening.mp4`,
              hour_slot: 18,
              duration_sec: 2,
              recorded_at: '2026-05-12T18:00:00.000+09:00',
            },
            {
              user_id: userId,
              video_url: `${userId}/night.mp4`,
              hour_slot: 22,
              duration_sec: 2,
              recorded_at: '2026-05-12T22:00:00.000+09:00',
            },
          ])
          .select('id, hour_slot');
        expect(logsError).toBeNull();
        expect(logs).toHaveLength(3);

        const recalc = await service.rpc('recalculate_daily_log_for_date', {
          p_log_date: '2026-05-12',
          p_user_id: userId,
        });
        expect(recalc.error).toBeNull();
        expect(recalc.data?.status).toBe('COMPLETED');

        const userClient = makeAnonClient();
        const signIn = await userClient.auth.signInWithPassword({ email, password });
        expect(signIn.error).toBeNull();

        const targetLogId = logs?.find((log) => log.hour_slot === 22)?.id;
        const deleted = await userClient.rpc('delete_own_log_and_recalculate', {
          p_log_id: targetLogId,
        });
        expect(deleted.error).toBeNull();
        expect(deleted.data?.[0]).toMatchObject({
          log_date: '2026-05-12',
          remaining_count: 2,
          status: 'INCOMPLETE',
        });

        const remaining = await service
          .from('logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        expect(remaining.error).toBeNull();
        expect(remaining.count).toBe(2);
      } finally {
        if (userId) await service.auth.admin.deleteUser(userId);
      }
    });
  },
);

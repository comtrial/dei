/**
 * Feature flag RPC(evaluate_my_flags) 통합 테스트 — 실제 Supabase.
 * "각 variant 가 의도대로 평가되는지" 를 실유저 JWT(앱 동일 경로)로 검증한다.
 *   - flag 없으면 {} (앱은 fallback 으로 안전 동작)
 *   - 시간경과 룰 매칭 (days_since_first_video >= N → variant)
 *   - 룰 미충족 시 rollout/default 로 분기 + 같은 유저 안정성
 *   - enabled=false → 항상 default_value
 * 로컬 Supabase 없으면 skip (CI 에서 강제 실행).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  hasServiceRoleKey,
  isSupabaseReachable,
  makeAnonClient,
  makeServiceClient,
} from './setup';

const reachable = await isSupabaseReachable();
const run = reachable && hasServiceRoleKey();

const FLAG = `e2e_test_flag_${Date.now()}`;
const TS = Date.now();

describe.skipIf(!run)('evaluate_my_flags (feature flag RPC)', () => {
  const admin = run ? makeServiceClient() : (null as never);
  const createdUserIds: string[] = [];

  // 테스트 유저 생성 + 실유저 JWT 클라이언트 (앱 동일 경로)
  async function makeUser(opts: { firstVideoDaysAgo?: number | null }) {
    const email = `e2e-flag-${TS}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `E2eFlag!${Math.random().toString(36).slice(2)}Zz9`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    const uid = data.user.id;
    createdUserIds.push(uid);

    const firstVideo =
      opts.firstVideoDaysAgo == null
        ? null
        : new Date(Date.now() - opts.firstVideoDaysAgo * 86400_000).toISOString();
    await admin
      .from('account_status')
      .upsert({
        user_id: uid,
        account_state: 'active',
        onboarding_state: 'complete',
        first_video_uploaded_at: firstVideo,
      });
    await admin.from('profiles').upsert({ user_id: uid, nickname: 'e2e', gender: 'M' });

    const anon = makeAnonClient();
    const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr || !sess.session) throw new Error(`signin: ${sErr?.message}`);
    return makeAnonClientWithToken(sess.session.access_token);
  }

  function makeAnonClientWithToken(token: string) {
    const c = makeAnonClient();
    // RPC 호출 시 유저 JWT 사용 (auth.uid() = 그 유저)
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rpc: (name: string) =>
        (c.rpc as any)(name, undefined, { head: false }) as Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>,
      raw: c,
      token,
    };
  }

  beforeAll(async () => {
    // 테스트 flag 정리(이전 잔여) 후 생성
    await admin.from('feature_flags').delete().eq('key', FLAG);
  });

  afterAll(async () => {
    if (!run) return;
    await admin.from('feature_flags').delete().eq('key', FLAG);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  it('flag 없는 key 는 결과에 없다 → 앱 fallback (RPC 는 에러 없이 {} 또는 다른 flag만)', async () => {
    const user = await makeUser({ firstVideoDaysAgo: 1 });
    const { data, error } = await (user.raw.rpc as never as (n: string) => Promise<{
      data: Record<string, unknown> | null;
      error: { message?: string } | null;
    }>)('evaluate_my_flags');
    expect(error).toBeNull();
    expect(data && typeof data === 'object').toBe(true);
    expect((data ?? {})[FLAG]).toBeUndefined();
  });

  it('시간경과 룰: 영상 2일↑ → B, 1일 → 룰 미충족(B 아님)', async () => {
    // flag + 룰 생성 (variants ["A","B"], 룰: days_since_first_video>=2 → "B")
    await admin.from('feature_flags').insert({
      key: FLAG,
      default_value: 'A',
      rollout_variants: ['A', 'B'],
      rollout_percentage: 100,
    });
    await admin.from('feature_flag_rules').insert({
      flag_key: FLAG,
      priority: 0,
      result_value: 'B',
      conditions: [{ attribute: 'days_since_first_video', operator: 'gte', value: 2 }],
    });

    const old = await makeUser({ firstVideoDaysAgo: 3 });
    const { data: d1 } = await (old.raw.rpc as never as (n: string) => Promise<{
      data: Record<string, unknown> | null;
    }>)('evaluate_my_flags');
    expect((d1 ?? {})[FLAG]).toBe('B'); // 룰 매칭

    const fresh = await makeUser({ firstVideoDaysAgo: 1 });
    const { data: d2 } = await (fresh.raw.rpc as never as (n: string) => Promise<{
      data: Record<string, unknown> | null;
    }>)('evaluate_my_flags');
    expect((d2 ?? {})[FLAG]).not.toBe('B'); // 룰 미충족 → rollout variant (A 또는 B 중 안정)
    expect(['A', 'B']).toContain((d2 ?? {})[FLAG]);
  });

  it('rollout 안정성: 같은 유저는 매 호출 같은 variant', async () => {
    const user = await makeUser({ firstVideoDaysAgo: null }); // 룰 미충족 → rollout
    const calls = await Promise.all(
      [0, 1, 2].map(() =>
        (user.raw.rpc as never as (n: string) => Promise<{ data: Record<string, unknown> | null }>)(
          'evaluate_my_flags',
        ),
      ),
    );
    const vals = calls.map((c) => (c.data ?? {})[FLAG]);
    expect(new Set(vals).size).toBe(1); // 항상 동일
  });

  it('enabled=false → 룰/rollout 무시하고 default_value', async () => {
    await admin.from('feature_flags').update({ enabled: false }).eq('key', FLAG);
    const user = await makeUser({ firstVideoDaysAgo: 5 }); // 룰 충족 조건이지만 enabled=false
    const { data } = await (user.raw.rpc as never as (n: string) => Promise<{
      data: Record<string, unknown> | null;
    }>)('evaluate_my_flags');
    expect((data ?? {})[FLAG]).toBe('A'); // default
    await admin.from('feature_flags').update({ enabled: true }).eq('key', FLAG);
  });
});

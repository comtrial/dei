/**
 * Feature flag RPC(evaluate_my_flags) 통합 테스트 — 실제 Supabase.
 * "각 variant 가 의도대로 평가되는지" 를 실유저 JWT(앱 동일 경로)로 검증한다.
 *   - flag 없으면 결과에 없음 (앱은 fallback 으로 안전 동작)
 *   - 시간경과 룰 매칭 (days_since_first_video >= N → variant)
 *   - 룰 미충족 시 rollout/default 로 분기 + 같은 유저 안정성
 *   - enabled=false → 항상 default_value
 * 로컬 Supabase 없으면 skip (CI 에서 강제 실행).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hasServiceRoleKey, isSupabaseReachable, makeAnonClient, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const reachable = await isSupabaseReachable();
const run = reachable && hasServiceRoleKey();

const FLAG = `e2e_test_flag_${Date.now()}`;
const TS = Date.now();

type FlagMap = Record<string, unknown>;

describe.skipIf(!run)('evaluate_my_flags (feature flag RPC)', () => {
  const admin = run ? makeServiceClient() : (null as never);
  const createdUserIds: string[] = [];

  /** 실유저 JWT 를 Authorization 헤더에 실은 클라이언트 — auth.uid()=그 유저 (앱 동일 경로). */
  function clientWithToken(token: string): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  async function evaluate(client: SupabaseClient): Promise<FlagMap> {
    const { data, error } = await (
      client.rpc as unknown as (
        name: string,
      ) => Promise<{ data: FlagMap | null; error: { message?: string } | null }>
    )('evaluate_my_flags');
    if (error) throw new Error(`evaluate_my_flags: ${error.message}`);
    return data ?? {};
  }

  /** 테스트 유저 생성 + 실유저 JWT 클라이언트 반환. */
  async function makeUser(opts: { firstVideoDaysAgo?: number | null }): Promise<SupabaseClient> {
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
    await admin.from('account_status').upsert({
      user_id: uid,
      account_state: 'active',
      onboarding_state: 'complete',
      first_video_uploaded_at: firstVideo,
    });
    await admin.from('profiles').upsert({ user_id: uid, nickname: 'e2e', gender: 'M' });

    const anon = makeAnonClient();
    const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr || !sess.session) throw new Error(`signin: ${sErr?.message}`);
    return clientWithToken(sess.session.access_token);
  }

  beforeAll(async () => {
    await admin.from('feature_flags').delete().eq('key', FLAG);
  });

  afterAll(async () => {
    if (!run) return;
    await admin.from('feature_flags').delete().eq('key', FLAG);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  it('flag 없는 key 는 결과에 없다 → 앱 fallback', async () => {
    const user = await makeUser({ firstVideoDaysAgo: 1 });
    const flags = await evaluate(user);
    expect(flags[FLAG]).toBeUndefined();
  });

  it('시간경과 룰: 영상 2일↑ → 룰값(RULE_HIT), 1일 → 룰 미충족(rollout variant)', async () => {
    // 룰 result_value 를 rollout_variants 에 없는 값으로 두면 "룰 매칭"과 "rollout"이
    // 결과값으로 명확히 구분된다 (rollout 은 RULE_HIT 를 절대 못 줌).
    await admin.from('feature_flags').insert({
      key: FLAG,
      default_value: 'A',
      rollout_variants: ['A', 'B'],
      rollout_percentage: 100,
    });
    await admin.from('feature_flag_rules').insert({
      flag_key: FLAG,
      priority: 0,
      result_value: 'RULE_HIT',
      conditions: [{ attribute: 'days_since_first_video', operator: 'gte', value: 2 }],
    });

    const old = await makeUser({ firstVideoDaysAgo: 3 });
    expect((await evaluate(old))[FLAG]).toBe('RULE_HIT'); // 룰 매칭

    const fresh = await makeUser({ firstVideoDaysAgo: 1 });
    const v = (await evaluate(fresh))[FLAG];
    expect(v).not.toBe('RULE_HIT'); // 룰 미충족 → 룰값 절대 안 나옴
    expect(['A', 'B']).toContain(v); // rollout variant
  });

  it('rollout 안정성: 같은 유저는 매 호출 같은 variant', async () => {
    const user = await makeUser({ firstVideoDaysAgo: null }); // 룰 미충족 → rollout
    const vals = await Promise.all([0, 1, 2].map(() => evaluate(user).then((f) => f[FLAG])));
    expect(new Set(vals).size).toBe(1); // 항상 동일
  });

  it('enabled=false → 룰/rollout 무시하고 default_value', async () => {
    await admin.from('feature_flags').update({ enabled: false }).eq('key', FLAG);
    const user = await makeUser({ firstVideoDaysAgo: 5 }); // 룰 충족 조건이지만 enabled=false
    expect((await evaluate(user))[FLAG]).toBe('A'); // default
    await admin.from('feature_flags').update({ enabled: true }).eq('key', FLAG);
  });
});

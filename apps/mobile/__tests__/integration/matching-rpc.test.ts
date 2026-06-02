// apps/mobile/__tests__/integration/matching-rpc.test.ts
//
// 매칭 엔진 통합 테스트 (실 Supabase, RPC 계약 기준).
// SSOT: docs/superpowers/plans/2026-06-02-matching-engine.md (Task 2~6)
//       + docs/matching-spec/ALGORITHM-SPEC.md (§4·§5·§7·§9·§10)
//       + /tmp/matching-impl/testcode-*.txt (76 시나리오 — 본 파일에 통합·중복제거).
//
// RPC 계약(plan 권위):
//   _tier_of(p_waited_minutes int) -> int (0/1/2)
//   match_and_create(p_side_a_user_ids uuid[], p_side_a_gender text,
//                    p_side_b_user_ids uuid[], p_side_b_gender text) -> uuid|null  (group_match.id)
//   try_match(p_queue_id uuid) -> uuid|null  (group_match.id)
//   admin_force_match(p_team_a uuid, p_team_b uuid) -> uuid|null  (group_match.id)
//   expire_my_stale_queue() -> int
//
// 규칙(CLAUDE.md §7·8·9): 전용 테스트 유저(e2e-*@example.test) 만 생성·사용,
//   try/finally 로 전량 cleanup(BASELINE==AFTER). admin(service_role)=셋업/카운트/시간조작/cleanup.
//   Docker/키 없으면 자동 skip(skipIf) — CI(verify.yml integration)가 강제 실행.
//
// 반환값 주의: 본 엔진의 매칭 RPC 는 group_match.id 를 반환한다(명세 §4·§7). 테스트는
//   resolveMatch() 로 반환 uuid → group_match 행(+ room_id) 을 견고히 해석한다(반환이
//   group_match.id 이든 room_id 이든 동작).
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SHOULD_RUN = Boolean(process.env.RUN_INTEGRATION || process.env.CI);
const PW = 'e2e-pass-1234!';

type TestUser = { id: string; email: string; client: SupabaseClient };

let run = false;
let admin: SupabaseClient;

// per-test 리소스 추적 — afterEach 에서 역순 정리 (BASELINE==AFTER).
let createdUserIds: string[] = [];
let createdTeamIds: string[] = [];
let createdQueueIds: string[] = [];
let createdRoomIds: string[] = [];

let seq = 0;
function uniqEmail(tag: string): string {
  seq += 1;
  return `e2e-match-${tag}-${Date.now().toString(36)}-${seq}-${Math.random()
    .toString(36)
    .slice(2, 6)}@example.test`;
}

/** 전용 테스트 유저 생성 + 실 JWT signIn + 프로필 게이트 충족. */
async function makeUser(gender: 'male' | 'female', tag: string): Promise<TestUser> {
  const email = uniqEmail(tag);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`createUser(${email}) failed`);
  const id = data.user.id;
  createdUserIds.push(id);

  const { error: pErr } = await admin
    .from('profile')
    .update({
      gender,
      nickname: `e2e_${tag}_${id.slice(0, 8)}`,
      photo_url: `https://example.test/${id}.jpg`,
      is_adult: true,
      region: 'seoul',
      is_in_active_room: false,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('user_id', id);
  if (pErr) throw new Error(`profile gate update(${email}) failed: ${pErr.message}`);

  const client = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PW });
  if (sErr) throw new Error(`signIn(${email}) failed: ${sErr.message}`);
  return { id, email, client };
}

async function makeUsers(gender: 'male' | 'female', n: number, tag: string): Promise<TestUser[]> {
  const out: TestUser[] = [];
  for (let i = 0; i < n; i += 1) out.push(await makeUser(gender, `${tag}${i}`));
  return out;
}

/** 친구팀(kind='user') + team_member + (옵션) match_queue waiting 행. owner = users[0]. */
async function mkTeamQueue(
  users: TestUser[],
  gender: 'male' | 'female',
  opts: { enqueue?: boolean; enqueuedAt?: string; expiresAt?: string; region?: string | null } = {},
): Promise<{ teamId: string; queueId: string | null }> {
  const owner = users[0];
  const { data: team, error: tErr } = await admin
    .from('team')
    .insert({
      owner_user_id: owner.id,
      gender,
      target_size: users.length,
      kind: 'user',
      status: 'ready',
    })
    .select('id')
    .single();
  if (tErr || !team) throw new Error(`team insert failed: ${tErr?.message}`);
  const teamId = team.id as string;
  createdTeamIds.push(teamId);

  const { error: tmErr } = await admin.from('team_member').insert(
    users.map((u, i) => ({
      team_id: teamId,
      user_id: u.id,
      role: i === 0 ? 'owner' : 'member',
    })),
  );
  if (tmErr) throw new Error(`team_member insert failed: ${tmErr.message}`);

  if (opts.enqueue === false) return { teamId, queueId: null };

  const insert: Record<string, unknown> = {
    team_id: teamId,
    gender,
    required_gender: gender === 'male' ? 'female' : 'male',
    desired_size: users.length,
    region: opts.region === undefined ? 'seoul' : opts.region,
    status: 'waiting',
  };
  if (opts.enqueuedAt) insert.enqueued_at = opts.enqueuedAt;
  insert.expires_at = opts.expiresAt ?? new Date(Date.now() + 24 * 3600_000).toISOString();
  const { data: q, error: qErr } = await admin
    .from('match_queue')
    .insert(insert)
    .select('id')
    .single();
  if (qErr || !q) throw new Error(`match_queue insert failed: ${qErr?.message}`);
  createdQueueIds.push(q.id);
  return { teamId, queueId: q.id as string };
}

// ── 검증 헬퍼 ────────────────────────────────────────────────────────────────

type GroupMatchRow = {
  id: string;
  room_id: string | null;
  status: string;
  team_a_id: string;
  team_b_id: string;
};

/** 반환 uuid 를 group_match 행으로 해석. 반환이 group_match.id 든 room_id 든 견고히 처리. */
async function resolveMatch(returnedId: string | null): Promise<GroupMatchRow | null> {
  if (!returnedId) return null;
  const byId = await admin
    .from('group_match')
    .select('id, room_id, status, team_a_id, team_b_id')
    .eq('id', returnedId)
    .maybeSingle();
  if (byId.data) {
    const row = byId.data as GroupMatchRow;
    if (row.room_id) createdRoomIds.push(row.room_id);
    return row;
  }
  const byRoom = await admin
    .from('group_match')
    .select('id, room_id, status, team_a_id, team_b_id')
    .eq('room_id', returnedId)
    .maybeSingle();
  if (byRoom.data) {
    const row = byRoom.data as GroupMatchRow;
    if (row.room_id) createdRoomIds.push(row.room_id);
    return row;
  }
  return null;
}

async function roomMemberCount(roomId: string): Promise<number> {
  const { count } = await admin
    .from('room_member')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('status', 'active');
  return count ?? 0;
}

async function teamStatus(teamId: string): Promise<string | null> {
  const { data } = await admin.from('team').select('status').eq('id', teamId).maybeSingle();
  return data?.status ?? null;
}

async function queueStatusByTeam(teamId: string): Promise<string | null> {
  const { data } = await admin
    .from('match_queue')
    .select('status')
    .eq('team_id', teamId)
    .order('enqueued_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status ?? null;
}

async function matchMemberSideCount(matchId: string, side: 'a' | 'b'): Promise<number> {
  const { count } = await admin
    .from('match_member')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('side', side);
  return count ?? 0;
}

async function teamKindById(teamId: string): Promise<string | null> {
  const { data } = await admin.from('team').select('kind').eq('id', teamId).maybeSingle();
  return data?.kind ?? null;
}

async function setBusy(userIds: string[], busy: boolean): Promise<void> {
  await admin.from('profile').update({ is_in_active_room: busy }).in('user_id', userIds);
}

beforeAll(async () => {
  run = SHOULD_RUN && (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
});

// per-test 전량 cleanup — 다음 케이스는 깨끗한 상태에서 시작 (BASELINE==AFTER).
afterEach(async () => {
  if (!run) return;
  // 매칭이 만든 synthetic 팀 + room 을 createdTeamIds 로 역추적해 회수.
  try {
    if (createdTeamIds.length) {
      const { data: gms } = await admin
        .from('group_match')
        .select('id, room_id, team_a_id, team_b_id')
        .or(createdTeamIds.map((t) => `team_a_id.eq.${t},team_b_id.eq.${t}`).join(','));
      for (const gm of gms ?? []) {
        if (gm.room_id) createdRoomIds.push(gm.room_id as string);
        if (gm.team_a_id) createdTeamIds.push(gm.team_a_id as string);
        if (gm.team_b_id) createdTeamIds.push(gm.team_b_id as string);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    for (const id of [...new Set(createdRoomIds)]) await admin.from('room').delete().eq('id', id);
  } catch {
    /* ignore */
  }
  try {
    for (const id of [...new Set(createdTeamIds)]) {
      await admin.from('group_match').delete().or(`team_a_id.eq.${id},team_b_id.eq.${id}`);
    }
  } catch {
    /* ignore */
  }
  try {
    for (const id of [...new Set(createdQueueIds)]) await admin.from('match_queue').delete().eq('id', id);
  } catch {
    /* ignore */
  }
  try {
    for (const id of [...new Set(createdTeamIds)]) await admin.from('team').delete().eq('id', id);
  } catch {
    /* ignore */
  }
  try {
    for (const id of [...new Set(createdUserIds)]) await admin.auth.admin.deleteUser(id);
  } catch {
    /* ignore */
  }
  createdUserIds = [];
  createdTeamIds = [];
  createdQueueIds = [];
  createdRoomIds = [];
});

// ════════════════════════════════════════════════════════════════════════════
// Task 2 — 매칭 헬퍼 (_tier_of)
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('matching helpers', () => {
  it('_tier_of returns 0 for fresh, 1 after tier1_minutes, 2 after tier2_minutes', async () => {
    const { data: t0 } = await admin.rpc('_tier_of', { p_waited_minutes: 0 });
    const { data: t1 } = await admin.rpc('_tier_of', { p_waited_minutes: 45 });
    const { data: t2 } = await admin.rpc('_tier_of', { p_waited_minutes: 200 });
    expect(t0).toBe(0);
    expect(t1).toBe(1);
    expect(t2).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Task 3 — match_and_create (원자 생성 + 합성팀) : 정확일치 / 비대칭 / 거부 / 멱등
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('match_and_create — exact / asymmetric / synthetic', () => {
  it('1:1 정확일치 → room_member 2, group_match active, team locked, queue matched', async () => {
    const m1 = await makeUser('male', 'm1');
    const f1 = await makeUser('female', 'f1');
    const a = await mkTeamQueue([m1], 'male');
    const b = await mkTeamQueue([f1], 'female');

    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m1.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [f1.id],
      p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(gm!.status).toBe('active');
    expect(gm!.room_id).toBeTruthy();
    expect(await roomMemberCount(gm!.room_id!)).toBe(2);
    expect(await teamStatus(a.teamId)).toBe('locked');
    expect(await teamStatus(b.teamId)).toBe('locked');
    expect(await queueStatusByTeam(a.teamId)).toBe('matched');
    expect(await queueStatusByTeam(b.teamId)).toBe('matched');

    const { data: profs } = await admin
      .from('profile')
      .select('is_in_active_room')
      .in('user_id', [m1.id, f1.id]);
    expect((profs ?? []).every((p) => p.is_in_active_room === true)).toBe(true);
  });

  it('2 solos vs 2 solos → synthetic teams + room + 4 room_members, side a=2/b=2', async () => {
    const males = await makeUsers('male', 2, 'sm2');
    const females = await makeUsers('female', 2, 'sf2');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(4);
    expect(await matchMemberSideCount(gm!.id, 'a')).toBe(2);
    expect(await matchMemberSideCount(gm!.id, 'b')).toBe(2);
    // 양측 solo → 둘 다 synthetic team.
    expect(await teamKindById(gm!.team_a_id)).toBe('synthetic');
    expect(await teamKindById(gm!.team_b_id)).toBe('synthetic');
  });

  it('3:3 solo merge → room_member 6, two synthetic teams', async () => {
    const males = await makeUsers('male', 3, 'sm3');
    const females = await makeUsers('female', 3, 'sf3');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(6);
    expect(await matchMemberSideCount(gm!.id, 'a')).toBe(3);
    expect(await matchMemberSideCount(gm!.id, 'b')).toBe(3);
  });

  it('5:3 비대칭(합8 경계, 한쪽 5 상한) → room_member 8', async () => {
    const males = await makeUsers('male', 5, 'sm5');
    const females = await makeUsers('female', 3, 'sf5b');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(8);
    const aCnt = await matchMemberSideCount(gm!.id, 'a');
    const bCnt = await matchMemberSideCount(gm!.id, 'b');
    expect([aCnt, bCnt].sort().join(',')).toBe('3,5');
  });

  it('1↔3 비대칭(혼자1 ↔ 친구팀3) → room_member 4, friend team kept (user), solo side synthetic', async () => {
    const m1 = await makeUser('male', 'a1');
    const females = await makeUsers('female', 3, 'b3');
    const friend = await mkTeamQueue(females, 'female', { enqueue: false });
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m1.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(4);
    // 기존 친구팀이 한 side 로 그대로 사용됨.
    expect([gm!.team_a_id, gm!.team_b_id]).toContain(friend.teamId);
    expect(await teamKindById(friend.teamId)).toBe('user');
  });

  it('동성 양측 거부(반대성별 hard) → null/error, group_match 0, team not locked', async () => {
    const m1 = await makeUser('male', 'g1');
    const m2 = await makeUser('male', 'g2');
    const a = await mkTeamQueue([m1], 'male');
    const b = await mkTeamQueue([m2], 'male');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m1.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [m2.id],
      p_side_b_gender: 'male',
    });
    expect(Boolean(error) || ret === null).toBe(true);
    if (error) expect(error.message).toMatch(/same_gender|gender|opposite/i);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .or(`team_a_id.eq.${a.teamId},team_b_id.eq.${a.teamId}`);
    expect(gmCount ?? 0).toBe(0);
    expect(await teamStatus(a.teamId)).not.toBe('locked');
    expect(await teamStatus(b.teamId)).not.toBe('locked');
  });

  it('합9(5+4) 초과 거부 → null/error, group_match 0, queue 여전히 waiting', async () => {
    const males = await makeUsers('male', 5, 'c5');
    const females = await makeUsers('female', 4, 'c4');
    const a = await mkTeamQueue(males, 'male');
    const b = await mkTeamQueue(females, 'female');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(Boolean(error) || ret === null).toBe(true);
    if (error) expect(error.message).toMatch(/over_capacity|capacity|cell|8|exceed|size/i);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .or(`team_a_id.eq.${a.teamId},team_b_id.eq.${a.teamId}`);
    expect(gmCount ?? 0).toBe(0);
    expect(await queueStatusByTeam(a.teamId)).toBe('waiting');
    expect(await queueStatusByTeam(b.teamId)).toBe('waiting');
  });

  it('한쪽 6명(6:1) 거부 (side ≤5 상한 위반) → null/error, group_match 0', async () => {
    const males = await makeUsers('male', 6, 'd6');
    const f1 = await makeUser('female', 'd1');
    const b = await mkTeamQueue([f1], 'female');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: [f1.id],
      p_side_b_gender: 'female',
    });
    expect(Boolean(error) || ret === null).toBe(true);
    if (error) expect(error.message).toMatch(/over_capacity|side|size|5|exceed|cell/i);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .or(`team_a_id.eq.${b.teamId},team_b_id.eq.${b.teamId}`);
    expect(gmCount ?? 0).toBe(0);
  });

  it('빈 side 거부 → null/error, no room', async () => {
    const m = await makeUser('male', 'e1');
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [],
      p_side_b_gender: 'female',
    });
    expect(Boolean(error) || ret === null).toBe(true);
  });

  it('멤버 한 명이 이미 active room → 원자 롤백, group_match 0, queue waiting', async () => {
    const males = await makeUsers('male', 3, 'h3');
    const females = await makeUsers('female', 3, 'h3f');
    const a = await mkTeamQueue(males, 'male');
    const b = await mkTeamQueue(females, 'female');
    await setBusy([females[0].id], true);
    const { data: ret, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    });
    expect(Boolean(error) || ret === null).toBe(true);
    if (error) expect(error.message).toMatch(/busy|active_room|in_room|unavailable/i);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .or(`team_a_id.eq.${a.teamId},team_b_id.eq.${a.teamId}`);
    expect(gmCount ?? 0).toBe(0);
    expect(await teamStatus(a.teamId)).not.toBe('locked');
    expect(await teamStatus(b.teamId)).not.toBe('locked');
    expect(await queueStatusByTeam(a.teamId)).toBe('waiting');
    expect(await queueStatusByTeam(b.teamId)).toBe('waiting');
  });

  it('동일 쌍 동시 match_and_create 2회 → group_match active 정확히 1행, room_member 4', async () => {
    const males = await makeUsers('male', 2, 'i2');
    const females = await makeUsers('female', 2, 'i2f');
    const a = await mkTeamQueue(males, 'male');
    const b = await mkTeamQueue(females, 'female');
    const args = {
      p_side_a_user_ids: males.map((u) => u.id),
      p_side_a_gender: 'male',
      p_side_b_user_ids: females.map((u) => u.id),
      p_side_b_gender: 'female',
    };
    const [r1, r2] = await Promise.all([
      admin.rpc('match_and_create', args),
      admin.rpc('match_and_create', args),
    ]);
    const ids = [r1.data, r2.data].filter(Boolean) as string[];
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(
        `and(team_a_id.eq.${a.teamId},team_b_id.eq.${b.teamId}),and(team_a_id.eq.${b.teamId},team_b_id.eq.${a.teamId})`,
      );
    expect(gmCount).toBe(1);
    const gm = await resolveMatch(ids[0]);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(4);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Task 4 — try_match (Tier 완화 페어링 + solo merge)
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('try_match — tier-relaxed pairing + solo merge', () => {
  it('Tier0 정확일치(남2팀 + 여2팀) → 즉시 4인 방, 양 큐 matched', async () => {
    const males = await makeUsers('male', 2, 'tm2');
    const females = await makeUsers('female', 2, 'tf2');
    const b = await mkTeamQueue(females, 'female'); // 여팀 먼저 대기
    const a = await mkTeamQueue(males, 'male'); // 남팀 enqueue 순간 (Tier0)

    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: a.queueId });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(4);
    expect(await queueStatusByTeam(a.teamId)).toBe('matched');
    expect(await queueStatusByTeam(b.teamId)).toBe('matched');
  });

  it('Tier0 size 불일치(1 vs 3) → null, 둘 다 waiting', async () => {
    const m1 = await makeUser('male', 't0m');
    const females = await makeUsers('female', 3, 't0f');
    const b = await mkTeamQueue(females, 'female');
    const a = await mkTeamQueue([m1], 'male'); // enqueued_at=now → Tier0
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: a.queueId });
    expect(error).toBeNull();
    expect(ret).toBeNull();
    expect(await queueStatusByTeam(a.teamId)).toBe('waiting');
    expect(await queueStatusByTeam(b.teamId)).toBe('waiting');
  });

  it('Tier1 진입(backdate) 후 1↔3 비대칭 성사 → room_member 4', async () => {
    const m1 = await makeUser('male', 't1m');
    const females = await makeUsers('female', 3, 't1f');
    const b = await mkTeamQueue(females, 'female');
    const longAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    const a = await mkTeamQueue([m1], 'male', { enqueuedAt: longAgo });
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: a.queueId });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(4);
    const aCnt = await matchMemberSideCount(gm!.id, 'a');
    const bCnt = await matchMemberSideCount(gm!.id, 'b');
    expect([aCnt, bCnt].sort().join(',')).toBe('1,3');
    expect(await queueStatusByTeam(a.teamId)).toBe('matched');
    expect(await queueStatusByTeam(b.teamId)).toBe('matched');
  });

  it('solo merge: 남 혼자×3(Tier1) + 여 혼자×3 → 3:3 방(4:4 고집 안 함)', async () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60_000).toISOString();
    const males: TestUser[] = [];
    for (let i = 0; i < 3; i += 1) males.push(await makeUser('male', `slm${i}`));
    const females: TestUser[] = [];
    for (let i = 0; i < 3; i += 1) females.push(await makeUser('female', `slf${i}`));
    for (const u of males) await mkTeamQueue([u], 'male', { enqueuedAt: fortyMinAgo });
    for (const u of females) await mkTeamQueue([u], 'female', { enqueuedAt: fortyMinAgo });

    const { data: firstMaleQueue } = await admin
      .from('match_queue')
      .select('id')
      .eq('team_id', createdTeamIds[0])
      .single();
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: firstMaleQueue!.id });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(6);
  });

  it('성별 공급 0 → try_match null, waiting 잔류 (굶음은 에러 아님)', async () => {
    const f = await makeUser('female', 's0f');
    const q = await mkTeamQueue([f], 'female');
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: q.queueId });
    expect(error).toBeNull();
    expect(ret).toBeNull();
    expect(await queueStatusByTeam(q.teamId)).toBe('waiting');
  });

  it('만료된 후보(expires_at 과거)는 try_match 후보에서 제외', async () => {
    const f = await makeUser('female', 'exf');
    const m = await makeUser('male', 'exm');
    await mkTeamQueue([f], 'female', { expiresAt: new Date(Date.now() - 3600_000).toISOString() });
    const mq = await mkTeamQueue([m], 'male');
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: mq.queueId });
    expect(error).toBeNull();
    expect(ret).toBeNull();
    expect(await queueStatusByTeam(mq.teamId)).toBe('waiting');
  });

  it('region soft — T2 전 같은 지역 후보 우선', async () => {
    const seoulF = await makeUser('female', 'rsf');
    const busanF = await makeUser('female', 'rbf');
    const seoulM = await makeUser('male', 'rsm');
    const seoulFTeam = await mkTeamQueue([seoulF], 'female', { region: 'seoul' });
    await mkTeamQueue([busanF], 'female', { region: 'busan' });
    const mTeam = await mkTeamQueue([seoulM], 'male', { region: 'seoul' });
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: mTeam.queueId });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    const partner = gm!.team_a_id === mTeam.teamId ? gm!.team_b_id : gm!.team_a_id;
    expect(partner).toBe(seoulFTeam.teamId);
  });

  it('두 male 큐 동시 try_match(1 female 후보) → 정확히 1 매칭, 1 null', async () => {
    const f1 = await makeUser('female', 'cf1');
    const m1 = await makeUser('male', 'cm1');
    const m2 = await makeUser('male', 'cm2');
    const fTeam = await mkTeamQueue([f1], 'female');
    const mA = await mkTeamQueue([m1], 'male');
    const mB = await mkTeamQueue([m2], 'male');
    const [rA, rB] = await Promise.all([
      admin.rpc('try_match', { p_queue_id: mA.queueId }),
      admin.rpc('try_match', { p_queue_id: mB.queueId }),
    ]);
    const matched = [rA.data, rB.data].filter((x): x is string => typeof x === 'string');
    const nulls = [rA.data, rB.data].filter((x) => x == null);
    expect(matched.length).toBe(1);
    expect(nulls.length).toBe(1);
    const { count: gmCount } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(`team_a_id.eq.${fTeam.teamId},team_b_id.eq.${fTeam.teamId}`);
    expect(gmCount).toBe(1);
    const { data: queues } = await admin
      .from('match_queue')
      .select('status')
      .in('id', [fTeam.queueId!, mA.queueId!, mB.queueId!]);
    expect((queues ?? []).filter((q) => q.status === 'matched').length).toBe(2);
    expect((queues ?? []).filter((q) => q.status === 'waiting').length).toBe(1);
  });

  it('상대가 매칭 직전 cancel → 소진된 후보 skip, male waiting 잔류', async () => {
    const m1 = await makeUser('male', 'ccm');
    const f1 = await makeUser('female', 'ccf');
    const mTeam = await mkTeamQueue([m1], 'male');
    const fTeam = await mkTeamQueue([f1], 'female');
    await admin.from('match_queue').update({ status: 'cancelled' }).eq('id', fTeam.queueId!);
    const { data: ret, error } = await admin.rpc('try_match', { p_queue_id: mTeam.queueId });
    expect(error).toBeNull();
    expect(ret).toBeNull();
    expect(await queueStatusByTeam(mTeam.teamId)).toBe('waiting');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Task 6 — admin_force_match (백도어) + expire_my_stale_queue (lazy expire)
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('matching ops — admin_force_match / expire_my_stale_queue', () => {
  it('admin_force_match: 두 팀 직접 매칭(Tier 게이트 우회) → room_member 2', async () => {
    const m = await makeUser('male', 'afm');
    const f = await makeUser('female', 'aff');
    const tM = await mkTeamQueue([m], 'male', { enqueue: false });
    const tF = await mkTeamQueue([f], 'female', { enqueue: false });
    const { data: ret, error } = await admin.rpc('admin_force_match', {
      p_team_a: tM.teamId,
      p_team_b: tF.teamId,
    });
    expect(error).toBeNull();
    const gm = await resolveMatch(ret as string | null);
    expect(gm).not.toBeNull();
    expect(await roomMemberCount(gm!.room_id!)).toBe(2);
  });

  it('admin_force_match: 존재하지 않는 team → 거부, group_match 0', async () => {
    const fakeA = crypto.randomUUID();
    const fakeB = crypto.randomUUID();
    const { data: ret, error } = await admin.rpc('admin_force_match', {
      p_team_a: fakeA,
      p_team_b: fakeB,
    });
    expect(Boolean(error) || ret === null).toBe(true);
    const { count } = await admin
      .from('group_match')
      .select('*', { count: 'exact', head: true })
      .or(`team_a_id.eq.${fakeA},team_b_id.eq.${fakeA},team_a_id.eq.${fakeB},team_b_id.eq.${fakeB}`);
    expect(count).toBe(0);
  });

  it('expire_my_stale_queue: 본인 만료 waiting 만 expired, 타인/유효 큐 무영향', async () => {
    const f = await makeUser('female', 'esf');
    const other = await makeUser('female', 'eso');
    const stale = await mkTeamQueue([f], 'female', {
      expiresAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });
    const fresh = await mkTeamQueue([f], 'female', {
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const otherStale = await mkTeamQueue([other], 'female', {
      expiresAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });

    const { error } = await f.client.rpc('expire_my_stale_queue');
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from('match_queue')
      .select('id, status')
      .in('id', [stale.queueId!, fresh.queueId!, otherStale.queueId!]);
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r.status]));
    expect(byId[stale.queueId!]).toBe('expired');
    expect(byId[fresh.queueId!]).toBe('waiting');
    expect(byId[otherStale.queueId!]).toBe('waiting');
  });
});

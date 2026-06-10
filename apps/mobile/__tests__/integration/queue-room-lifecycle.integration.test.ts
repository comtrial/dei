// apps/mobile/__tests__/integration/queue-room-lifecycle.integration.test.ts
//
// 큐·방 라이프사이클 + 상태→화면 라우팅 통합 테스트 (실 Supabase).
// ────────────────────────────────────────────────────────────────────────────
// 출처: 실기기에서 발견된 사용자 시나리오 (PR #60 가드 수정의 검증 짝).
//   "큐 waiting / 방 active 회원은 앱 진입 시 무조건 큐/방 화면으로 가야 하고,
//    뒤로가기로 홈(매칭 전)으로 빠져나가면 안 된다."
//
// matching-rpc.test.ts 가 매칭 *엔진 RPC* 를 커버한다면, 이 파일은 그 위의
//   ① 상태→화면 *라우팅 결정 쿼리* (splash/app-layout 이 실제로 보는 쿼리)
//   ② 사용자 *여정 관통* (enqueue→match→leave→재참여→재매칭, is_in_active_room 전이)
// 를 실DB 로 검증한다. UI 동작(제스처/백버튼)은 jest(_layout.test.tsx)가 잡고,
// 여기서는 그 라우팅이 의존하는 *서버 상태*가 올바른지를 잡는다.
//
// 규칙(CLAUDE.md §7·8·9): 전용 유저(e2e-*@example.test)만, try/finally 역순
//   cleanup(BASELINE==AFTER). leave 는 앱과 동일 경로(functions.invoke('leave-room'),
//   user JWT)로 호출 — RPC 직접 우회 금지(Edge 미배포·Edge 로직 버그를 잡기 위함).
//   Docker/키 없으면 skipIf 로 자동 skip, CI(verify.yml integration)가 강제 실행.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SHOULD_RUN = Boolean(process.env.RUN_INTEGRATION || process.env.CI);
const PW = 'e2e-pass-1234!';

type TestUser = { id: string; email: string; client: SupabaseClient };

let admin: SupabaseClient;
let run = false;

// per-test 리소스 추적 — afterEach 역순 정리 (BASELINE==AFTER).
let createdUserIds: string[] = [];
let createdTeamIds: string[] = [];
let createdQueueIds: string[] = [];
let createdRoomIds: string[] = [];

let seq = 0;
function uniqEmail(tag: string): string {
  seq += 1;
  return `e2e-qrl-${tag}-${Date.now().toString(36)}-${seq}-${Math.random()
    .toString(36)
    .slice(2, 6)}@example.test`;
}

/** 전용 테스트 유저 + 실 JWT signIn + 프로필 게이트 충족. */
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

/** 친구팀(kind='user', ready) + team_member + (옵션) match_queue waiting. owner=users[0]. */
async function mkTeamQueue(
  users: TestUser[],
  gender: 'male' | 'female',
  opts: { enqueue?: boolean } = {},
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
    users.map((u, i) => ({ team_id: teamId, user_id: u.id, role: i === 0 ? 'owner' : 'member' })),
  );
  if (tmErr) throw new Error(`team_member insert failed: ${tmErr.message}`);

  if (opts.enqueue === false) return { teamId, queueId: null };

  const { data: q, error: qErr } = await admin
    .from('match_queue')
    .insert({
      team_id: teamId,
      gender,
      required_gender: gender === 'male' ? 'female' : 'male',
      desired_size: users.length,
      region: 'seoul',
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: 'waiting',
    })
    .select('id')
    .single();
  if (qErr || !q) throw new Error(`queue insert failed: ${qErr?.message}`);
  createdQueueIds.push(q.id as string);
  return { teamId, queueId: q.id as string };
}

/**
 * splash/app-layout 이 라우팅을 결정할 때 보는 쿼리를 그대로 재현한다.
 * (app/index.tsx · app/(app)/queue.tsx 의 부트스트랩 조회와 동형)
 *   activeRoomId 있음        → 방(S13) 으로
 *   else queueWaiting 있음    → 큐(S07) 로
 *   else                      → 홈(S05)
 */
async function resolveRoute(
  client: SupabaseClient,
  userId: string,
): Promise<{ activeRoomId: string | null; queueWaitingId: string | null; route: 'room' | 'queue' | 'home' }> {
  const { data: roomMember } = await client
    .from('room_member')
    .select('room_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const { data: teamMembers } = await client.from('team_member').select('team_id').eq('user_id', userId);
  const teamIds = (teamMembers ?? []).map((t) => t.team_id);
  let queueWaitingId: string | null = null;
  if (teamIds.length > 0) {
    const { data: queue } = await client
      .from('match_queue')
      .select('id, expires_at')
      .in('team_id', teamIds)
      .eq('status', 'waiting')
      .limit(1)
      .maybeSingle();
    if (queue && (!queue.expires_at || new Date(queue.expires_at).getTime() > Date.now())) {
      queueWaitingId = queue.id as string;
    }
  }

  const activeRoomId = (roomMember?.room_id as string | undefined) ?? null;
  const route = activeRoomId ? 'room' : queueWaitingId ? 'queue' : 'home';
  return { activeRoomId, queueWaitingId, route };
}

beforeAll(async () => {
  run = SHOULD_RUN && (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
});

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
// ① 상태 → 화면 라우팅 결정 쿼리 (PR #60 가드의 서버측 짝)
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('상태 → 라우팅 결정 (splash/app-layout 부트스트랩)', () => {
  it('큐 waiting 회원 → route=queue (홈 아님)', async () => {
    const [m] = [await makeUser('male', 'qw')];
    await mkTeamQueue([m], 'male', { enqueue: true });

    const r = await resolveRoute(m.client, m.id);
    expect(r.route).toBe('queue');
    expect(r.queueWaitingId).not.toBeNull();
    expect(r.activeRoomId).toBeNull();
  });

  it('방 active 회원 → route=room (홈 아님)', async () => {
    const [m] = [await makeUser('male', 'rm')];
    const [f] = [await makeUser('female', 'rf')];
    await mkTeamQueue([m], 'male', { enqueue: false });
    await mkTeamQueue([f], 'female', { enqueue: false });
    const ret = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [f.id],
      p_side_b_gender: 'female',
    });
    expect(ret.error).toBeNull();

    const r = await resolveRoute(m.client, m.id);
    expect(r.route).toBe('room');
    expect(r.activeRoomId).not.toBeNull();
  });

  it('큐·방 둘 다 없는 회원 → route=home', async () => {
    const [m] = [await makeUser('male', 'hm')];
    const r = await resolveRoute(m.client, m.id);
    expect(r.route).toBe('home');
  });

  it('만료된 큐(expires_at 과거)는 라우팅에서 큐로 보지 않음 → route=home', async () => {
    const [m] = [await makeUser('male', 'eq')];
    const { teamId } = await mkTeamQueue([m], 'male', { enqueue: false });
    const { data: q } = await admin
      .from('match_queue')
      .insert({
        team_id: teamId,
        gender: 'male',
        required_gender: 'female',
        desired_size: 1,
        region: 'seoul',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        status: 'waiting',
      })
      .select('id')
      .single();
    if (q) createdQueueIds.push(q.id as string);

    const r = await resolveRoute(m.client, m.id);
    expect(r.route).toBe('home');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ② 사용자 여정 관통: enqueue → match → leave(앱 경로) → 재참여 → 재매칭
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!SHOULD_RUN)('여정 관통 (매칭 → 방 나가기 → 재참여 → 재매칭)', () => {
  it('방 나가기(leave-room Edge, 앱 경로) → is_in_active_room=false, room ended, route=home', async () => {
    const [m] = [await makeUser('male', 'lm')];
    const [f] = [await makeUser('female', 'lf')];
    await mkTeamQueue([m], 'male', { enqueue: false });
    await mkTeamQueue([f], 'female', { enqueue: false });
    const ret = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [f.id],
      p_side_b_gender: 'female',
    });
    expect(ret.error).toBeNull();
    const before = await resolveRoute(m.client, m.id);
    expect(before.route).toBe('room');
    const roomId = before.activeRoomId as string;

    // 앱과 동일 경로: user JWT 로 leave-room Edge invoke (RPC 직접 우회 금지, CLAUDE.md §9).
    // leave-room 계약: roomId + reason ∈ {mood,mistake,bad_member,other} 필수
    // (other 면 detail 도). 앱은 leave-confirm 화면(S16)에서 reason 을 받아 보낸다.
    const { error: leaveErr } = await m.client.functions.invoke('leave-room', {
      body: { roomId, reason: 'mood' },
    });
    expect(leaveErr).toBeNull();

    // 상태 검증: 본인 room_member left, profile is_in_active_room=false.
    const { data: rm } = await admin
      .from('room_member')
      .select('status')
      .eq('room_id', roomId)
      .eq('user_id', m.id)
      .maybeSingle();
    expect(rm?.status).toBe('left');
    const { data: prof } = await admin
      .from('profile')
      .select('is_in_active_room, last_room_leave_at')
      .eq('user_id', m.id)
      .maybeSingle();
    expect(prof?.is_in_active_room).toBe(false);
    expect(prof?.last_room_leave_at).not.toBeNull();

    // 나간 사람 라우팅 = home (방 아님).
    const after = await resolveRoute(m.client, m.id);
    expect(after.route).toBe('home');
  });

  it('전체 여정: A·B 매칭 → A 나감 → A 재참여(큐 대기 중인 C와 재매칭) → A route=room', async () => {
    const a = await makeUser('male', 'ja'); // 주인공
    const b = await makeUser('female', 'jb'); // 첫 매칭 상대
    const c = await makeUser('female', 'jc'); // 큐에서 대기 중인 재매칭 상대

    // 1) A↔B 매칭 → A 방 안.
    await mkTeamQueue([a], 'male', { enqueue: false });
    await mkTeamQueue([b], 'female', { enqueue: false });
    const m1 = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [a.id],
      p_side_a_gender: 'male',
      p_side_b_user_ids: [b.id],
      p_side_b_gender: 'female',
    });
    expect(m1.error).toBeNull();
    const r1 = await resolveRoute(a.client, a.id);
    expect(r1.route).toBe('room');

    // 2) C 는 여자 혼자 큐에 waiting (재매칭 상대 풀).
    const cTeam = await mkTeamQueue([c], 'female', { enqueue: true });

    // 3) A 가 정식으로 방 나감 (앱 경로, reason 필수). → is_in_active_room=false, route=home.
    const { error: leaveErr } = await a.client.functions.invoke('leave-room', {
      body: { roomId: r1.activeRoomId as string, reason: 'mood' },
    });
    expect(leaveErr).toBeNull();
    const r2 = await resolveRoute(a.client, a.id);
    expect(r2.route).toBe('home');

    // 4) A 가 다시 혼자 참여 → 12h 재매칭 제한 중이므로 booster pass 를 room 생성 시 1회 소비한다.
    const { data: pass, error: passErr } = await admin
      .from('pass')
      .insert({
        granted: 1,
        kind: 'booster',
        remaining: 1,
        source: 'purchase',
        status: 'active',
        user_id: a.id,
      })
      .select('id')
      .single();
    expect(passErr).toBeNull();

    const aReTeam = await mkTeamQueue([a], 'male', { enqueue: true });
    const tm = await admin.rpc('try_match', { p_queue_id: aReTeam.queueId });
    expect(tm.error).toBeNull();
    expect(tm.data).not.toBeNull(); // group_match.id 반환 = 성사

    const { data: consumedPass } = await admin
      .from('pass')
      .select('remaining, status')
      .eq('id', pass!.id)
      .single();
    expect(consumedPass?.remaining).toBe(0);
    expect(consumedPass?.status).toBe('consumed');

    // 5) A 와 C 가 같은 새 방에 함께, A route=room. C 큐는 matched.
    const r3 = await resolveRoute(a.client, a.id);
    expect(r3.route).toBe('room');
    const newRoomId = r3.activeRoomId as string;
    if (newRoomId) createdRoomIds.push(newRoomId);

    const { data: members } = await admin
      .from('room_member')
      .select('user_id, status')
      .eq('room_id', newRoomId)
      .eq('status', 'active');
    const memberIds = (members ?? []).map((x) => x.user_id);
    expect(memberIds).toContain(a.id);
    expect(memberIds).toContain(c.id);
    expect(memberIds).not.toContain(b.id); // 첫 상대는 새 방에 없음

    const { data: cQueue } = await admin
      .from('match_queue')
      .select('status')
      .eq('id', cTeam.queueId as string)
      .maybeSingle();
    expect(cQueue?.status).toBe('matched');
  });
});

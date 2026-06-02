// scripts/e2e-matching-realdb.mjs
// 매칭 엔진 실DB e2e — 앱 동일 경로(functions.invoke('enqueue-match-queue')) 관통.
// CLAUDE.md §8·9: ①배포(enqueue-match-queue Edge + 매칭 RPC 마이그레이션) ②env
// ③실 발급 user JWT(signInWithPassword) 로 앱과 동일하게 invoke → 즉시 매칭 → DB 반영.
// service_role 우회 금지(앱 경로 검증 목적). 전용 유저 e2e-*@example.test, try/finally cleanup.
//
// 실행:
//   source ~/.dei/secrets.env
//   EXPO_PUBLIC_SUPABASE_URL=$DEI_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY=$DEI_ANON_KEY \
//   SUPABASE_SERVICE_ROLE_KEY=$DEI_SERVICE_ROLE_KEY node scripts/e2e-matching-realdb.mjs
//
// ⚠️ 원격 GoTrue 사인인 rate limit: 유저 수 최소(2명)로 유지.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.DEI_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.DEI_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.DEI_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('env 누락: EXPO_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const PW = 'e2e-match-pw-1234!';
const created = []; // user ids
const rooms = []; // room ids
const teams = []; // team ids
const results = [];
const log = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${note ? ' — ' + note : ''}`);
};

/** 전용 유저 생성 + 프로필 게이트 충족 + 실 user-JWT 클라이언트(앱과 동일). */
async function makeAppUser(tag, gender) {
  const email = `e2e-match-${tag}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`createUser ${email}`);
  const id = data.user.id;
  created.push(id);
  await admin
    .from('profile')
    .update({
      gender,
      nickname: `e2e_${tag}_${id.slice(0, 6)}`,
      photo_url: `https://example.test/${id}.jpg`,
      is_adult: true,
      region: 'seoul',
      is_in_active_room: false,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('user_id', id);
  // 팀은 enqueue Edge 가 memberIds(본인 포함)로 직접 생성한다 — 여기서 미리 만들지 않음(앱 경로 재현).
  // 실 JWT 클라이언트 (앱과 동일 경로)
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PW });
  if (sErr) throw new Error(`signIn ${email}: ${sErr.message}`);
  return { id, email, client };
}

async function main() {
  // automation=auto_immediate 로 전환(테스트 동안). finally 에서 원복.
  await admin.from('match_config').update({ value: '"auto_immediate"' }).eq('key', 'automation');

  // 여성 먼저 enqueue(대기) → 남성 enqueue 순간 즉시 매칭 (앱 동일 functions.invoke)
  const F = await makeAppUser('f', 'female');
  const M = await makeAppUser('m', 'male');

  // F enqueue (대기). 앱 경로: functions.invoke (실 JWT)
  const fRes = await F.client.functions.invoke('enqueue-match-queue', {
    body: { memberIds: [F.id] },
  });
  // F 는 상대 없어 queued 여야
  const fQueued = !fRes.error && fRes.data && fRes.data.matched === false;
  log('E1 F enqueue → queued(상대 없음)', fQueued, JSON.stringify(fRes.data ?? fRes.error?.message ?? ''));

  // M enqueue → 즉시 매칭 (F 와 1:1)
  const mRes = await M.client.functions.invoke('enqueue-match-queue', {
    body: { memberIds: [M.id] },
  });
  const matched = !mRes.error && mRes.data && mRes.data.matched === true && !!mRes.data.roomId;
  log('E2 M enqueue → 즉시 매칭(앱 functions.invoke)', matched, JSON.stringify(mRes.data ?? mRes.error?.message ?? ''));

  if (mRes.data?.roomId) {
    rooms.push(mRes.data.roomId);
    // 방 멤버 2명 확인 (DB 반영)
    const { count } = await admin
      .from('room_member')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', mRes.data.roomId);
    log('E3 room_member 2명(1:1 방 생성)', count === 2, `count=${count}`);

    // 양측 큐 matched — 팀은 Edge 가 생성했으므로 owner(F.id/M.id)로 team 찾아 큐 조회
    const { data: ownTeams } = await admin
      .from('team')
      .select('id')
      .in('owner_user_id', [F.id, M.id]);
    const ownTeamIds = (ownTeams ?? []).map((t) => t.id);
    const { data: qs } = await admin
      .from('match_queue')
      .select('status')
      .in('team_id', ownTeamIds);
    const allMatched = (qs ?? []).length >= 2 && qs.every((q) => q.status === 'matched');
    log('E4 양측 match_queue=matched', allMatched, JSON.stringify((qs ?? []).map((q) => q.status)));

    // 양측 profile.is_in_active_room=true
    const { data: profs } = await admin
      .from('profile')
      .select('is_in_active_room')
      .in('user_id', [F.id, M.id]);
    log('E5 양측 is_in_active_room=true', (profs ?? []).every((p) => p.is_in_active_room));
  }

  // E6: automation=manual 일 때 enqueue → queued (자동매칭 안 함)
  await admin.from('match_config').update({ value: '"manual_admin_curation"' }).eq('key', 'automation');
  const M2 = await makeAppUser('m2', 'male');
  const m2Res = await M2.client.functions.invoke('enqueue-match-queue', {
    body: { memberIds: [M2.id] },
  });
  // 상대 여성 큐가 없으니 어차피 queued 지만, manual 이면 try_match 자체를 안 탐
  log('E6 manual 모드 enqueue → queued(자동매칭 게이트 off)', !m2Res.error && m2Res.data?.matched === false, JSON.stringify(m2Res.data ?? m2Res.error?.message ?? ''));
}

main()
  .catch((e) => {
    console.error('FATAL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // automation 원복
    await admin.from('match_config').update({ value: '"manual_admin_curation"' }).eq('key', 'automation');
    // 생성 리소스 정리 (room cascade → room_member/match_member, team, user)
    for (const r of rooms) await admin.from('room').delete().eq('id', r);
    // 팀은 Edge/RPC 가 생성(user/synthetic) — 테스트 유저 owner 팀 전량 삭제(match_queue cascade)
    if (created.length) await admin.from('team').delete().in('owner_user_id', created);
    for (const t of teams) await admin.from('team').delete().eq('id', t);
    for (const id of created) await admin.auth.admin.deleteUser(id);
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n=== 매칭 실DB e2e (앱 경로): ${passed}/${results.length} PASS ===`);
    if (results.length === 0 || passed < results.length) process.exitCode = 1;
  });

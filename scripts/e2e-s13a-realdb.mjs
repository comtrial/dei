// scripts/e2e-s13a-realdb.mjs
//
// S13a 실DB e2e — 앱과 "동일한" 경로(supabase.functions.invoke('send-message'))로
// 원격 배포된 Edge Function 을 실 발급 ES256 JWT(password grant)로 호출하고,
// 귓속말 제3자 누수(F3)를 realtime + REST 양면 음성단언으로 검증한다.
//
// 규칙(CLAUDE.md 7·8·9, 설계서 §3·§12):
//  - service_role 우회 금지: 메시지 전송/구독/가시성 판정은 전부 "사용자 JWT" 로.
//    admin(service_role) 은 오직 (a) 테스트 유저/방/멤버 셋업 (b) 진실 카운트 확인
//    (c) 끝나고 cleanup 에만 쓴다. F3/F8 의 보안 단언은 절대 admin 으로 하지 않는다.
//  - 전용 유저 e2e-room-*@example.test, try/finally 전량 cleanup, BASELINE==AFTER.
//  - 앱 동일 경로: functions.invoke('send-message') 1차. (RPC 직접 호출은 Edge 미배포를 못 잡음)
//
// 실행:
//   source ~/.dei/secrets.env && \
//   EXPO_PUBLIC_SUPABASE_URL=$DEI_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY=$DEI_ANON_KEY \
//   SUPABASE_SERVICE_ROLE_KEY=$DEI_SERVICE_ROLE_KEY SUPABASE_URL=$DEI_SUPABASE_URL \
//   SUPABASE_ANON_KEY=$DEI_ANON_KEY node scripts/e2e-s13a-realdb.mjs

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('env 누락 — `source ~/.dei/secrets.env` 후 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 주입 필요');
  process.exit(2);
}

// admin = 셋업/카운트/cleanup 전용 (보안 단언엔 절대 안 씀)
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const PW = 'e2e-pass-1234!';
const EMAILS = {
  a: 'e2e-room-a@example.test',
  b: 'e2e-room-b@example.test',
  c: 'e2e-room-c@example.test',
  d: 'e2e-room-d@example.test',
};
const created = [];   // user ids
const blockRows = []; // block ids (room cascade 가 set-null 이라 명시 정리)
let roomId;

const results = [];
const log = (name, ok, note = '') => {
  results.push({ name, ok: !!ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** non-2xx 응답은 functions.invoke 가 error(FunctionsHttpError)로 돌려준다.
 *  본문(JSON)은 error.context.json() 에 있다. 2xx 면 data 에 들어온다. */
async function readInvoke(res) {
  if (res.error) {
    let bodyJson = null;
    let httpStatus = res.error?.context?.status ?? null;
    try {
      if (typeof res.error?.context?.json === 'function') {
        bodyJson = await res.error.context.clone().json();
      }
    } catch {
      /* 본문 파싱 실패 — bodyJson=null 유지 */
    }
    return { ok: false, status: httpStatus, body: bodyJson, raw: res.error };
  }
  return { ok: true, status: 200, body: res.data, raw: null };
}

async function mkUser(email) {
  // 기존 잔여 동명 유저가 있으면 먼저 삭제(이전 실패 run 잔재)
  const c = userClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) 실패: ${error.message}`);
  created.push(data.user.id);
  // 실 발급 ES256 JWT (앱이 쓰는 그대로의 토큰 형식). service_role 아님.
  const { error: signErr } = await c.auth.signInWithPassword({ email, password: PW });
  if (signErr) throw new Error(`signIn(${email}) 실패: ${signErr.message}`);
  return { id: data.user.id, c, email };
}

/** 사용자 JWT 컨텍스트로 room:{roomId} 채널의 message INSERT 를 구독.
 *  SUBSCRIBED 까지 await 해서 구독 안정화를 시간이 아니라 상태로 보장. */
function subscribeMessages(user, roomId, onInsert) {
  const channel = user.c
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` },
      (p) => onInsert(p.new),
    );
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`구독 SUBSCRIBED 타임아웃(${user.email})`)), 15000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(t);
        reject(new Error(`구독 실패(${user.email}): ${status}`));
      }
    });
  });
  return { channel, ready };
}

async function main() {
  const A = await mkUser(EMAILS.a);
  const B = await mkUser(EMAILS.b);
  const C = await mkUser(EMAILS.c);

  const { data: room, error: roomErr } = await admin
    .from('room')
    .insert({ status: 'active' })
    .select()
    .single();
  if (roomErr) throw new Error(`room insert 실패: ${roomErr.message}`);
  roomId = room.id;
  const { error: memErr } = await admin.from('room_member').insert(
    [A, B, C].map((u) => ({ room_id: roomId, user_id: u.id, status: 'active' })),
  );
  if (memErr) throw new Error(`room_member insert 실패: ${memErr.message}`);

  // BASELINE (진실 카운트 — admin 은 허용 용도)
  const baseline = (await admin
    .from('message')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)).count ?? 0;

  // ── F1 / F8: 실 ES256 JWT 로 앱 동일 경로(functions.invoke) 전체채팅 send.
  //    F8 = 그 토큰이 Edge 의 getAuthenticatedUser 검증을 통과(401 안 남).
  const cm1 = crypto.randomUUID();
  const r1 = await readInvoke(
    await A.c.functions.invoke('send-message', {
      body: { room_id: roomId, body: '전체채팅 안녕', whisper_to_user_id: null, client_msg_id: cm1 },
    }),
  );
  log('F1 전체채팅 send (functions.invoke ok)', r1.ok && r1.body?.ok === true, r1.ok ? '' : `status=${r1.status} body=${JSON.stringify(r1.body)}`);
  log('F8 실 ES256 JWT — Edge 401 아님', r1.status !== 401, `status=${r1.status}`);

  // ── F3★ 귓속말 누수: A→B 귓속말. B(대상) realtime 수신 양성단언 / C(제3자) 미수신 음성단언.
  //    각 구독은 본인 JWT 컨텍스트 → RLS message_select_member 가 전달 시점에 평가.
  let bGot = false;
  let cGot = false;
  let bGotAny = false;
  let cGotAny = false; // C 가 전체채팅 등 본인이 봐도 되는 INSERT 는 받는지(소켓 살아있음 증명)
  const subB = subscribeMessages(B, roomId, (row) => {
    bGotAny = true;
    if (process.env.E2E_DEBUG) console.log(`  [B recv] whisper_to=${row.whisper_to_user_id} body=${row.body}`);
    if (row.whisper_to_user_id === B.id) bGot = true;
  });
  const subC = subscribeMessages(C, roomId, (row) => {
    cGotAny = true;
    if (process.env.E2E_DEBUG) console.log(`  [C recv] whisper_to=${row.whisper_to_user_id} body=${row.body}`);
    if (row.whisper_to_user_id === B.id) cGot = true; // A→B 귓속말이 C 에게 닿으면 LEAK
  });
  await Promise.all([subB.ready, subC.ready]);
  await sleep(800); // 구독 register 직후 안정화 여유

  const cm2 = crypto.randomUUID();
  const r3 = await readInvoke(
    await A.c.functions.invoke('send-message', {
      body: { room_id: roomId, body: 'B에게만 비밀(귓속말)', whisper_to_user_id: B.id, client_msg_id: cm2 },
    }),
  );
  if (!r3.ok) log('F3 (귓속말 send 자체)', false, `귓속말 전송 실패 status=${r3.status} body=${JSON.stringify(r3.body)}`);

  // 또한 C 가 봐도 되는 전체채팅을 하나 보내서 C 소켓이 정상 동작함을 능동 증명.
  const cm2b = crypto.randomUUID();
  await A.c.functions.invoke('send-message', {
    body: { room_id: roomId, body: '전체공개(소켓생존확인)', whisper_to_user_id: null, client_msg_id: cm2b },
  });

  await sleep(3000); // realtime 왕복 충분 대기 (음성단언이므로 넉넉히)

  if (process.env.E2E_DEBUG) console.log(`  [diag] bGotAny=${bGotAny} bGot=${bGot} cGotAny=${cGotAny} cGot=${cGot}`);
  log('F2 realtime 왕복 — B(대상) 귓속말 수신', bGot);
  log('F3★ 귓속말 C(제3자) realtime 미수신 (음성단언)', cGot === false, cGot ? 'LEAK!! C 가 A→B 귓속말을 realtime 으로 수신함' : '누수 없음');
  log('F3 보강 — C 소켓 생존(전체채팅은 수신)', cGotAny === true, cGotAny ? '' : 'C 소켓이 아무것도 못 받음 → F3 음성단언 신뢰도 저하');

  // ── F3 REST belt: C 의 JWT 로 그 귓속말 행을 SELECT 하면 0행 (RLS USING=false)
  const cSel = await C.c.from('message').select('id').eq('client_msg_id', cm2);
  log('F3 REST — C JWT 로 귓속말 미가시 (0행)', (cSel.data?.length ?? 0) === 0, cSel.error ? `err=${cSel.error.message}` : `rows=${cSel.data?.length ?? 0}`);
  // 대조군: B 의 JWT 로는 그 귓속말이 보여야 정상
  const bSel = await B.c.from('message').select('id').eq('client_msg_id', cm2);
  log('F3 대조 — B JWT 로 귓속말 가시 (1행)', (bSel.data?.length ?? 0) === 1, `rows=${bSel.data?.length ?? 0}`);

  await A.c.removeChannel(subB.channel).catch(() => {});
  await B.c.removeChannel(subB.channel).catch(() => {});
  await C.c.removeChannel(subC.channel).catch(() => {});
  // (채널은 각 클라에 묶임 — 안전하게 둘 다 시도)
  await B.c.removeChannel(subB.channel).catch(() => {});
  await C.c.removeChannel(subC.channel).catch(() => {});

  // ── F6 멱등: 동일 client_msg_id 2회 → message 1행
  const cm3 = crypto.randomUUID();
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'dup', whisper_to_user_id: null, client_msg_id: cm3 } });
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'dup', whisper_to_user_id: null, client_msg_id: cm3 } });
  const dupCount = (await admin.from('message').select('*', { count: 'exact', head: true })
    .eq('room_id', roomId).eq('user_id', A.id).eq('client_msg_id', cm3)).count;
  log('F6 멱등 — 동일 client_msg_id 2회 → 1행', dupCount === 1, `count=${dupCount}`);

  // ── F7 길이 경계 (code point): 501자 → 422 body_length
  const r7 = await readInvoke(
    await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'x'.repeat(501), whisper_to_user_id: null, client_msg_id: crypto.randomUUID() } }),
  );
  log('F7 길이 — 501자 거부 (422 body_length)', r7.status === 422 && r7.body?.error === 'body_length', `status=${r7.status} body=${JSON.stringify(r7.body)}`);
  // F7 보강 — 이모지(멀티바이트) code point 경계: 정확히 500 emoji 는 통과, 501 은 거부
  const okEmoji = '🙂'.repeat(500); // code point 500
  const r7b = await readInvoke(
    await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: okEmoji, whisper_to_user_id: null, client_msg_id: crypto.randomUUID() } }),
  );
  log('F7 보강 — 이모지 500 code point 통과', r7b.ok && r7b.body?.ok === true, `status=${r7b.status}`);

  // ── F5 비멤버 거부: 방에 없는 D → 403 not_room_member
  const D = await mkUser(EMAILS.d);
  const r5 = await readInvoke(
    await D.c.functions.invoke('send-message', { body: { room_id: roomId, body: '비멤버 침입', whisper_to_user_id: null, client_msg_id: crypto.randomUUID() } }),
  );
  log('F5 비멤버 거부 (403 not_room_member)', r5.status === 403 && r5.body?.error === 'not_room_member', `status=${r5.status} body=${JSON.stringify(r5.body)}`);

  // ── F4 차단 숨김: C 가 A 를 차단 → A 의 신규 전체메시지가 C 에게 안 보임
  const { data: blk, error: blkErr } = await C.c
    .from('block')
    .insert({ blocker_user_id: C.id, blocked_user_id: A.id, room_id: roomId })
    .select('id')
    .single();
  if (blkErr) {
    log('F4 (block insert)', false, `block insert 실패: ${blkErr.message}`);
  } else {
    blockRows.push(blk.id);
    const cm4 = crypto.randomUUID();
    const r4 = await readInvoke(
      await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: '차단후 전체메시지', whisper_to_user_id: null, client_msg_id: cm4 } }),
    );
    if (!r4.ok) log('F4 (차단후 send)', false, `status=${r4.status} body=${JSON.stringify(r4.body)}`);
    await sleep(400);
    const cSel2 = await C.c.from('message').select('id').eq('client_msg_id', cm4);
    log('F4 차단 발신자 메시지 C 미가시', (cSel2.data?.length ?? 0) === 0, `rows=${cSel2.data?.length ?? 0}`);
  }

  // ── BASELINE==AFTER 준비: 이 run 이 만든 메시지는 room cascade 로 전부 사라질 것.
  //    여기서는 baseline 값을 보관해 finally 에서 cleanup 후 동일 카운트 확인.
  return { baseline };
}

let baselineCount = 0;
main()
  .then((r) => { baselineCount = r?.baseline ?? 0; })
  .catch((e) => {
    console.error('FATAL', e?.stack ?? e);
    log('FATAL(main throw)', false, String(e?.message ?? e));
    process.exitCode = 1;
  })
  .finally(async () => {
    // ── cleanup: 방 삭제(cascade 로 message/room_member/message_mention 정리) + block + 유저
    try {
      for (const id of blockRows) await admin.from('block').delete().eq('id', id);
    } catch (e) { console.error('block cleanup 경고', e?.message); }
    try {
      if (roomId) await admin.from('room').delete().eq('id', roomId);
    } catch (e) { console.error('room cleanup 경고', e?.message); }
    try {
      for (const id of created) await admin.auth.admin.deleteUser(id);
    } catch (e) { console.error('user cleanup 경고', e?.message); }

    // ── BASELINE==AFTER: room 삭제로 이 방의 메시지는 0행이어야 한다(=시작 카운트와 동일).
    let after = null;
    try {
      after = (await admin.from('message').select('*', { count: 'exact', head: true }).eq('room_id', roomId)).count ?? 0;
    } catch { /* room 이 이미 지워져 조회 0 */ after = 0; }
    const baselineAfterOk = after === 0; // room 삭제 → 이 방 메시지 0. 시작(baselineCount)==끝(0 잔여) 의미.
    log(`cleanup BASELINE==AFTER (room 메시지 잔여 0)`, baselineAfterOk, `baseline(start)=${baselineCount} after(room rows)=${after}`);

    const passed = results.filter((r) => r.ok).length;
    const f3 = results.find((r) => r.name.startsWith('F3★'));
    console.log(`\n=== S13a 실DB e2e: ${passed}/${results.length} PASS ===`);
    console.log(`=== F3★ 귓속말 누수 음성단언: ${f3 ? (f3.ok ? 'PASS (누수 없음)' : 'FAIL (누수!)') : 'N/A'} ===`);
    if (results.length === 0 || passed < results.length) process.exitCode = 1;
  });

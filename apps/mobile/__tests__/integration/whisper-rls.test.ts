// apps/mobile/__tests__/integration/whisper-rls.test.ts
//
// 귓속말 가시성 RLS (실제 Supabase) — mock/단위로는 절대 못 잡는 기밀성 경계.
// CLAUDE.md 7/8/9항: 귓속말은 본인·상대만, 제3자 0행. user-JWT 클라로 실제
// RLS SELECT 를 관통 검증한다(service-role 은 RLS 우회라 read 검증엔 부적합 —
// 발신만 service/RPC, 조회는 각 사용자 JWT 클라).
//
// 전용 테스트 유저(e2e-*@example.test)만 생성·사용 → try/finally 전량 cleanup.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

let run = false;
let admin: SupabaseClient;
const created: string[] = [];
let roomId = '';
let A: { id: string; client: SupabaseClient };
let B: { id: string; client: SupabaseClient };
let C: { id: string; client: SupabaseClient };

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: 'test-pass-1234' });
  return { id: data.user.id, client };
}

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
  A = await makeUser('e2e-whisper-a@example.test');
  B = await makeUser('e2e-whisper-b@example.test');
  C = await makeUser('e2e-whisper-c@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room!.id;
  await admin.from('room_member').insert([
    { room_id: roomId, user_id: A.id, status: 'active' },
    { room_id: roomId, user_id: B.id, status: 'active' },
    { room_id: roomId, user_id: C.id, status: 'active' },
  ]);
});

afterAll(async () => {
  if (!run) return;
  await admin.from('room').delete().eq('id', roomId);
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)('귓속말 가시성 RLS (실제 Supabase)', () => {
  let whisperId = '';

  it('A→B 귓속말 발신 성공(RPC, 앱 경로와 동일 단위)', async () => {
    const { data, error } = await A.client.rpc('send_room_message', {
      p_room_id: roomId,
      p_body: '우리 둘이 따로 보자',
      p_whisper_to_user_id: B.id,
      p_client_msg_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    expect(data?.body).toBe('우리 둘이 따로 보자');
    whisperId = String(data!.id);
  });

  it('발신자 A 는 자기 귓속말을 본다 (RLS user_id=auth.uid())', async () => {
    const { data } = await A.client.from('message').select('id,body').eq('id', whisperId);
    expect(data?.length).toBe(1);
  });

  it('대상 B 는 받은 귓속말을 본다 (RLS whisper_to_user_id=auth.uid())', async () => {
    const { data } = await B.client.from('message').select('id,body').eq('id', whisperId);
    expect(data?.length).toBe(1);
    expect(data?.[0]?.body).toBe('우리 둘이 따로 보자');
  });

  it('제3자 C 는 그 귓속말을 보지 못한다 — 0행 (RLS 차단, mock 불가 핵심)', async () => {
    const { data } = await C.client.from('message').select('id').eq('id', whisperId);
    expect(data?.length).toBe(0);
  });

  it('전체 채팅(whisper_to=null)은 같은 방 전원이 본다 (baseline)', async () => {
    const { data: pub, error } = await A.client.rpc('send_room_message', {
      p_room_id: roomId,
      p_body: '다들 안녕',
      p_whisper_to_user_id: null,
      p_client_msg_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const pubId = String(pub!.id);
    for (const u of [A, B, C]) {
      const { data } = await u.client.from('message').select('id').eq('id', pubId);
      expect(data?.length).toBe(1);
    }
  });

  it('비멤버는 방 메시지를 조회할 수 없다 (RLS room_is_member 1차 게이트)', async () => {
    const outsider = await makeUser('e2e-whisper-out@example.test');
    const { data } = await outsider.client.from('message').select('id').eq('room_id', roomId);
    expect(data?.length).toBe(0);
  });
});

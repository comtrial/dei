// apps/mobile/__tests__/integration/send-message-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

let run = false;
let admin: SupabaseClient;
const created: string[] = []; // user ids for cleanup
let roomId = '';
let userA: { id: string; client: SupabaseClient };
let userB: { id: string; client: SupabaseClient };

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'test-pass-1234', email_confirm: true,
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
  userA = await makeUser('e2e-rpc-a@example.test');
  userB = await makeUser('e2e-rpc-b@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room!.id;
  await admin.from('room_member').insert([
    { room_id: roomId, user_id: userA.id, status: 'active' },
    { room_id: roomId, user_id: userB.id, status: 'active' },
  ]);
});

afterAll(async () => {
  if (!run) return;
  await admin.from('room').delete().eq('id', roomId);
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)('send_room_message RPC (real RLS)', () => {
  it('member sends a full-chat message → 1 row', async () => {
    const cmid = crypto.randomUUID();
    const { data, error } = await userA.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: '안녕', p_whisper_to_user_id: null, p_client_msg_id: cmid,
    });
    expect(error).toBeNull();
    expect(data?.body).toBe('안녕');
  });

  it('same client_msg_id twice → still 1 row (idempotent)', async () => {
    const cmid = crypto.randomUUID();
    await userA.client.rpc('send_room_message', { p_room_id: roomId, p_body: 'dup', p_whisper_to_user_id: null, p_client_msg_id: cmid });
    await userA.client.rpc('send_room_message', { p_room_id: roomId, p_body: 'dup', p_whisper_to_user_id: null, p_client_msg_id: cmid });
    const { count } = await admin.from('message').select('*', { count: 'exact', head: true })
      .eq('room_id', roomId).eq('user_id', userA.id).eq('client_msg_id', cmid);
    expect(count).toBe(1);
  });

  it('self-whisper rejected', async () => {
    const { error } = await userA.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: 'memo', p_whisper_to_user_id: userA.id, p_client_msg_id: crypto.randomUUID(),
    });
    expect(error?.message).toContain('invalid_whisper_target:self');
  });

  it('non-member cannot send', async () => {
    const outsider = await makeUser('e2e-rpc-out@example.test');
    const { error } = await outsider.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: 'x', p_whisper_to_user_id: null, p_client_msg_id: crypto.randomUUID(),
    });
    expect(error?.message).toContain('not_room_member');
  });
});

// apps/mobile/__tests__/integration/room-unread.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';
import { hasUnread } from '@/lib/chat/unread';

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

// 앱과 동일 경로: 본인 user-JWT 클라로 last_read_at 조회.
async function readLastReadAt(
  client: SupabaseClient,
  rid: string,
  uid: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('room_member')
    .select('last_read_at')
    .eq('room_id', rid)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return (data?.last_read_at as string | null) ?? null;
}

// 앱과 동일 경로: 본인 user-JWT 클라로 "내가 안 보낸" 최신 메시지 시각.
async function readLatestOthersAt(
  client: SupabaseClient,
  rid: string,
  uid: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('message')
    .select('created_at,user_id')
    .eq('room_id', rid)
    .neq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
  userA = await makeUser('e2e-unread-a@example.test');
  userB = await makeUser('e2e-unread-b@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room!.id;
  await admin.from('room_member').insert([
    { room_id: roomId, user_id: userA.id, status: 'active' },
    { room_id: roomId, user_id: userB.id, status: 'active' },
  ]);
});

afterAll(async () => {
  if (!run) return;
  await admin.from('room').delete().eq('id', roomId); // message/room_member cascade
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)(
  'room unread read-marker (real RLS + RPC)',
  () => {
    it('B가 메시지 전송 → A는 미읽음(last_read=null) → hasUnread true', async () => {
      const { error } = await userB.client.rpc('send_room_message', {
        p_room_id: roomId, p_body: '안녕 A', p_whisper_to_user_id: null,
        p_client_msg_id: crypto.randomUUID(),
      });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(lastRead).toBeNull();
      expect(latestOthers).not.toBeNull();
      expect(hasUnread(latestOthers, lastRead)).toBe(true);
    });

    it('A가 mark_room_read 호출 → last_read_at 갱신 → hasUnread false', async () => {
      const { error } = await userA.client.rpc('mark_room_read', { p_room_id: roomId });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(lastRead).not.toBeNull();
      expect(hasUnread(latestOthers, lastRead)).toBe(false);
    });

    it('B가 새 메시지 전송 → A hasUnread 다시 true', async () => {
      // mark_room_read(now())와 다음 메시지 created_at(now())의 동일초 경합 방지.
      await new Promise((r) => setTimeout(r, 1100));
      const { error } = await userB.client.rpc('send_room_message', {
        p_room_id: roomId, p_body: '또 왔어', p_whisper_to_user_id: null,
        p_client_msg_id: crypto.randomUUID(),
      });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(hasUnread(latestOthers, lastRead)).toBe(true);
    });

    it('비멤버는 mark_room_read 거절(not_room_member)', async () => {
      const outsider = await makeUser('e2e-unread-out@example.test');
      const { error } = await outsider.client.rpc('mark_room_read', { p_room_id: roomId });
      expect(error?.message).toContain('not_room_member');
    });
  },
);

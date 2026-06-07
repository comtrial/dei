import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import WebSocket from 'ws';

import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PASSWORD = 'test-pass-1234';
const REALTIME_TIMEOUT_MS = 10_000;
const REALTIME_TRANSPORT = WebSocket as unknown as WebSocketLikeConstructor;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let run = false;
let admin: SupabaseClient;
const createdUserIds: string[] = [];
let roomId = '';
let userA: { client: SupabaseClient; id: string };
let userB: { client: SupabaseClient; id: string };

async function makeUser(label: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = `e2e-room-leave-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  createdUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { timeout: REALTIME_TIMEOUT_MS, transport: REALTIME_TRANSPORT },
  });
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  if (signInData.session?.access_token) {
    client.realtime.setAuth(signInData.session.access_token);
  }

  return { client, id: data.user.id };
}

function waitForSubscribed(channel: ReturnType<SupabaseClient['channel']>) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('realtime subscribe timeout')),
      REALTIME_TIMEOUT_MS,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`realtime subscribe failed: ${status}`));
      }
    });
  });
}

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;

  admin = makeServiceClient();
  userA = await makeUser('a');
  userB = await makeUser('b');

  await admin.from('profile').update({ nickname: '수아' }).eq('user_id', userA.id);
  await admin.from('profile').update({ nickname: '민준' }).eq('user_id', userB.id);

  const { data: room, error: roomError } = await admin
    .from('room')
    .insert({ active_member_count: 2, member_count: 2, status: 'active' })
    .select('id')
    .single();
  if (roomError || !room) throw roomError ?? new Error('room insert failed');
  roomId = room.id;

  const { error: memberError } = await admin.from('room_member').insert([
    { room_id: roomId, user_id: userA.id, role: 'member', status: 'active' },
    { room_id: roomId, user_id: userB.id, role: 'member', status: 'active' },
  ]);
  if (memberError) throw memberError;
});

afterAll(async () => {
  if (!run) return;

  if (roomId) await admin.from('room').delete().eq('id', roomId);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)(
  'room member leave visibility (real Supabase)',
  () => {
    it('remaining member receives left realtime update and refresh sees leaver removed from active members', async () => {
      expect(run).toBe(true);

      const channel = userB.client.channel(`room-leave-${roomId}-${Date.now()}`);
      let updateTimer: ReturnType<typeof setTimeout> | undefined;
      let startUpdateTimeout: () => void;

      const updatePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            filter: `room_id=eq.${roomId}`,
            schema: 'public',
            table: 'room_member',
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (row.user_id !== userA.id) return;
            if (updateTimer) clearTimeout(updateTimer);
            resolve(row);
          },
        );
        startUpdateTimeout = () => {
          updateTimer = setTimeout(
            () => reject(new Error('room_member update timeout')),
            REALTIME_TIMEOUT_MS,
          );
        };
      });

      try {
        await waitForSubscribed(channel);
        startUpdateTimeout!();
        // Local Realtime can acknowledge the channel before its Postgres CDC binding is ready.
        await wait(1_000);

        const leftAt = new Date().toISOString();
        const { error: leaveError } = await userA.client
          .from('room_member')
          .update({ left_at: leftAt, status: 'left' })
          .eq('room_id', roomId)
          .eq('user_id', userA.id);

        expect(leaveError).toBeNull();

        const realtimeRow = await updatePromise;
        expect(realtimeRow.status).toBe('left');
        expect(realtimeRow.user_id).toBe(userA.id);
      } finally {
        if (updateTimer) clearTimeout(updateTimer);
        await userB.client.removeChannel(channel);
      }

      const { data: activeMembers, error: activeError } = await userB.client
        .from('room_member')
        .select('user_id, status')
        .eq('room_id', roomId)
        .eq('status', 'active');

      expect(activeError).toBeNull();
      expect(activeMembers?.map((member) => member.user_id)).toEqual([userB.id]);

      const { error: lifecycleInsertError } = await admin.from('room_lifecycle').insert({
        actor_user_id: userA.id,
        detail: { reason: 'other' },
        event: 'member_left',
        room_id: roomId,
      });
      expect(lifecycleInsertError).toBeNull();

      const { data: lifecycleRows, error: lifecycleSelectError } = await userB.client
        .from('room_lifecycle')
        .select('actor_user_id, event')
        .eq('room_id', roomId)
        .eq('event', 'member_left');

      expect(lifecycleSelectError).toBeNull();
      expect(lifecycleRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actor_user_id: userA.id, event: 'member_left' }),
        ]),
      );
    });
  },
);

export { isSupabaseReachable };

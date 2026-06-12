import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SHOULD_RUN = Boolean(process.env.RUN_INTEGRATION || process.env.CI);
const PW = 'e2e-pass-1234!';

let admin: SupabaseClient;
let run = false;
let createdUserIds: string[] = [];
let createdRoomIds: string[] = [];
let createdTeamIds: string[] = [];
let storageCleanup: Array<{ bucket: 'profile-photos' | 'room-videos'; path: string }> = [];

function uniqueEmail() {
  return `e2e-withdraw-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
}

async function countRows(table: string, column: string, userId: string) {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);

  if (error) throw error;
  return count ?? 0;
}

async function createIdentityVerifiedUser() {
  const email = uniqueEmail();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('failed to create test user');
  const userId = data.user.id;
  createdUserIds.push(userId);

  const client = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PW });
  if (signInError) throw signInError;

  const profilePhotoPath = `${userId}/profile.jpg`;
  const { error: profileUploadError } = await client.storage
    .from('profile-photos')
    .upload(profilePhotoPath, new Blob(['profile'], { type: 'image/jpeg' }), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (profileUploadError) throw profileUploadError;
  storageCleanup.push({ bucket: 'profile-photos', path: profilePhotoPath });

  const { error: profileError } = await admin
    .from('profile')
    .update({
      gender: 'male',
      is_adult: true,
      is_in_active_room: true,
      nickname: `e2e_withdraw_${userId.slice(0, 8)}`,
      onboarding_completed_at: new Date().toISOString(),
      photo_url: profilePhotoPath,
      region: 'seoul',
    })
    .eq('user_id', userId);
  if (profileError) throw profileError;

  const { error: verificationError } = await admin.from('auth_verification').insert({
    ci_hash: `ci-withdraw-${userId}`,
    provider: 'portone',
    provider_metadata: { purpose: 'signup' },
    status: 'verified',
    user_id: userId,
    verified_at: new Date().toISOString(),
  });
  if (verificationError) throw verificationError;

  const { error: notificationError } = await admin.from('notification_setting').upsert({
    chat_mention: true,
    match_alert: true,
    push_enabled: true,
    upload_reminder: true,
    user_id: userId,
  });
  if (notificationError) throw notificationError;

  const { error: pushError } = await admin.from('push_token').insert({
    platform: 'ios',
    token: `ExponentPushToken[withdraw-${userId.slice(0, 8)}]`,
    user_id: userId,
  });
  if (pushError) throw pushError;

  const { data: team, error: teamError } = await admin
    .from('team')
    .insert({
      gender: 'male',
      kind: 'user',
      owner_user_id: userId,
      status: 'ready',
      target_size: 1,
    })
    .select('id')
    .single();
  if (teamError || !team) throw teamError ?? new Error('team insert failed');
  const teamId = team.id as string;
  createdTeamIds.push(teamId);

  const { error: memberError } = await admin.from('team_member').insert({
    role: 'owner',
    team_id: teamId,
    user_id: userId,
  });
  if (memberError) throw memberError;

  const { error: queueError } = await admin.from('match_queue').insert({
    desired_size: 1,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    gender: 'male',
    region: 'seoul',
    required_gender: 'female',
    status: 'waiting',
    team_id: teamId,
  });
  if (queueError) throw queueError;

  const { data: room, error: roomError } = await admin
    .from('room')
    .insert({
      active_member_count: 1,
      member_count: 1,
      status: 'active',
    })
    .select('id')
    .single();
  if (roomError || !room) throw roomError ?? new Error('room insert failed');
  const roomId = room.id as string;
  createdRoomIds.push(roomId);

  const { error: roomMemberError } = await admin.from('room_member').insert({
    role: 'member',
    room_id: roomId,
    status: 'active',
    user_id: userId,
  });
  if (roomMemberError) throw roomMemberError;

  const videoPath = `${roomId}/${userId}/video.jpg`;
  const { error: roomVideoUploadError } = await client.storage
    .from('room-videos')
    .upload(videoPath, new Blob(['room-video'], { type: 'image/jpeg' }), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  if (roomVideoUploadError) throw roomVideoUploadError;
  storageCleanup.push({ bucket: 'room-videos', path: videoPath });

  const { error: videoError } = await admin.from('video').insert({
    duration_ms: 3000,
    room_id: roomId,
    status: 'ready',
    storage_path: videoPath,
    thumbnail_path: null,
    user_id: userId,
  });
  if (videoError) throw videoError;

  return { client, roomId, teamId, userId };
}

beforeAll(async () => {
  run = SHOULD_RUN && (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
});

afterEach(async () => {
  if (!run) return;

  for (const item of storageCleanup.reverse()) {
    try {
      await admin.storage.from(item.bucket).remove([item.path]);
    } catch {
      /* ignore cleanup errors */
    }
  }
  storageCleanup = [];

  for (const id of [...new Set(createdRoomIds)]) {
    try {
      await admin.from('room').delete().eq('id', id);
    } catch {
      /* ignore cleanup errors */
    }
  }
  createdRoomIds = [];

  for (const id of [...new Set(createdTeamIds)]) {
    try {
      await admin.from('team').delete().eq('id', id);
    } catch {
      /* ignore cleanup errors */
    }
  }
  createdTeamIds = [];

  for (const id of [...new Set(createdUserIds)]) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch {
      /* ignore cleanup errors */
    }
  }
  createdUserIds = [];
});

describe.skipIf(!SHOULD_RUN)('withdraw-account Edge Function', () => {
  it('uses the existing identity verification and clears app data for a clean re-entry signup flow', async () => {
    if (!run) return;
    const { client, roomId, teamId, userId } = await createIdentityVerifiedUser();

    const { data, error } = await client.functions.invoke<{ ok: true }>('withdraw-account', {
      body: { reason: 'not_using', detail: 'integration test' },
    });

    expect(error).toBeNull();
    expect(data).toEqual({ ok: true });

    const { data: deletedAuthUser } = await admin.auth.admin.getUserById(userId);
    expect(deletedAuthUser.user).toBeNull();

    await expect(countRows('profile', 'user_id', userId)).resolves.toBe(0);
    await expect(countRows('auth_verification', 'user_id', userId)).resolves.toBe(0);
    await expect(countRows('notification_setting', 'user_id', userId)).resolves.toBe(0);
    await expect(countRows('push_token', 'user_id', userId)).resolves.toBe(0);
    await expect(countRows('team_member', 'user_id', userId)).resolves.toBe(0);
    await expect(countRows('video', 'user_id', userId)).resolves.toBe(0);
    const { count: waitingQueueCount, error: queueCountError } = await admin
      .from('match_queue')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'waiting');
    expect(queueCountError).toBeNull();
    expect(waitingQueueCount).toBe(0);

    const { data: profileObjects } = await admin.storage.from('profile-photos').list(userId);
    expect(profileObjects ?? []).toHaveLength(0);

    const { data: roomVideoObjects } = await admin.storage.from('room-videos').list(`${roomId}/${userId}`);
    expect(roomVideoObjects ?? []).toHaveLength(0);

    const { data: rejoinLock } = await admin
      .from('identity_rejoin_lock')
      .select('locked_until, reason, user_id')
      .eq('user_id', userId)
      .eq('reason', 'withdraw')
      .maybeSingle();
    expect(rejoinLock?.locked_until).toBeTruthy();

    const { data: roomAfterWithdraw } = await admin
      .from('room')
      .select('active_member_count, ended_reason, status')
      .eq('id', roomId)
      .maybeSingle();
    expect(roomAfterWithdraw).toMatchObject({
      active_member_count: 0,
      ended_reason: 'all_left',
      status: 'ended',
    });
  });
});

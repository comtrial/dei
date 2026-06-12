import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError } from '../_shared/log.ts';
import {
  codedErrorResponse,
  IDENTITY_POLICY,
  IDENTITY_PROVIDER,
} from '../_shared/identity-verification.ts';

type WithdrawBody = {
  detail?: unknown;
  reason?: unknown;
};

type StorageBucket = 'profile-photos' | 'room-videos';
type AdminSupabase = Awaited<ReturnType<typeof getAuthenticatedUser>>['supabase'];

const RECENT_REAUTH_WINDOW_MS = 10 * 60 * 1000;

function isStorageObjectPath(value?: string | null) {
  if (!value) return false;
  return !/^https?:\/\//i.test(value) && !value.startsWith('file:');
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function removeStoragePaths(
  supabase: AdminSupabase,
  bucket: StorageBucket,
  paths: string[],
) {
  const uniquePaths = uniqueStrings(paths);
  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw error;
    }
  }
}

async function collectOwnedStoragePaths(
  supabase: AdminSupabase,
  userId: string,
  knownPaths: Record<StorageBucket, string[]>,
) {
  const paths: Record<StorageBucket, string[]> = {
    'profile-photos': [...knownPaths['profile-photos']],
    'room-videos': [...knownPaths['room-videos']],
  };

  const { data: profilePhotos, error: listProfilePhotosError } = await supabase.storage
    .from('profile-photos')
    .list(userId, { limit: 1000 });

  if (listProfilePhotosError) {
    throw listProfilePhotosError;
  }

  for (const item of profilePhotos ?? []) {
    if (item.name) {
      paths['profile-photos'].push(`${userId}/${item.name}`);
    }
  }

  // Storage 객체가 DB row 없이 남아 있으면 auth hard delete 가 실패할 수 있다.
  // storage schema 조회가 막힌 환경에서는 known path cleanup 뒤 deleteUser 에서
  // 실패가 드러나므로, 여기서는 보강 조회로만 사용한다.
  const storageQuery = supabase.schema('storage').from('objects');
  const { data: ownedObjects } = await storageQuery
    .select('bucket_id, name')
    .in('bucket_id', ['profile-photos', 'room-videos'])
    .eq('owner', userId);

  for (const object of ownedObjects ?? []) {
    if (
      (object.bucket_id === 'profile-photos' || object.bucket_id === 'room-videos')
      && typeof object.name === 'string'
    ) {
      paths[object.bucket_id].push(object.name);
    }
  }

  return {
    'profile-photos': uniqueStrings(paths['profile-photos']),
    'room-videos': uniqueStrings(paths['room-videos']),
  };
}

async function reconcileRoomsAfterWithdrawal(
  supabase: AdminSupabase,
  roomIds: string[],
  endedAt: string,
) {
  for (const roomId of uniqueStrings(roomIds)) {
    const [{ count: memberCount, error: memberError }, { count: activeCount, error: activeError }] =
      await Promise.all([
        supabase
          .from('room_member')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId),
        supabase
          .from('room_member')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('status', 'active'),
      ]);

    if (memberError) throw memberError;
    if (activeError) throw activeError;

    const remainingMembers = memberCount ?? 0;
    const remainingActiveMembers = activeCount ?? 0;
    const { error } = await supabase
      .from('room')
      .update({
        active_member_count: remainingActiveMembers,
        member_count: remainingMembers,
        ...(remainingActiveMembers === 0
          ? { ended_at: endedAt, ended_reason: 'all_left', status: 'ended' }
          : {}),
      })
      .eq('id', roomId);

    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return codedErrorResponse('METHOD_NOT_ALLOWED', 'method not allowed', 405);
  }

  // IRREVERSIBLE action — catch 에서 식별자를 잃지 않도록 hoist.
  let userId: string | undefined;
  let withdrawStage = 'withdraw_account_pipeline';
  let capturedReason: string | null = null;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as WithdrawBody;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    const detail = typeof body.detail === 'string' ? body.detail.trim() : null;
    capturedReason = reason;
    const verifiedAfter = new Date(Date.now() - RECENT_REAUTH_WINDOW_MS).toISOString();
    const withdrawnAt = new Date().toISOString();

    const { data: recentVerification, error: verificationError } = await supabase
      .from('auth_verification')
      .select('ci_hash, id, verified_at')
      .eq('user_id', user.id)
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .eq('provider_metadata->>purpose', 'withdraw')
      .gte('verified_at', verifiedAfter)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verificationError) {
      throw verificationError;
    }

    if (!recentVerification) {
      return codedErrorResponse(
        'BAD_REQUEST',
        '본인인증 재확인이 필요해요.',
        403,
      );
    }

    if (!recentVerification.ci_hash) {
      return codedErrorResponse(
        'BAD_REQUEST',
        '탈퇴 제한 정보를 저장할 수 없어요. 고객센터로 문의해주세요.',
        400,
      );
    }

    const [
      { data: profile, error: profileError },
      { data: activeRoomRows, error: roomMemberError },
      { data: teamMemberRows, error: teamMemberError },
      { data: videoRows, error: videoError },
    ] = await Promise.all([
      supabase
        .from('profile')
        .select('photo_url')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('room_member')
        .select('room_id')
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('team_member')
        .select('team_id')
        .eq('user_id', user.id),
      supabase
        .from('video')
        .select('storage_path, thumbnail_path')
        .eq('user_id', user.id),
    ]);

    if (profileError) throw profileError;
    if (roomMemberError) throw roomMemberError;
    if (teamMemberError) throw teamMemberError;
    if (videoError) throw videoError;

    const activeRoomIds = uniqueStrings((activeRoomRows ?? []).map((row) => row.room_id));
    const teamIds = uniqueStrings((teamMemberRows ?? []).map((row) => row.team_id));
    const roomVideoPaths = uniqueStrings(
      (videoRows ?? []).flatMap((row) => [row.storage_path, row.thumbnail_path]),
    ).filter(isStorageObjectPath);
    const profilePhotoPaths = isStorageObjectPath(profile?.photo_url)
      ? [profile.photo_url]
      : [];
    const storagePaths = await collectOwnedStoragePaths(supabase, user.id, {
      'profile-photos': profilePhotoPaths,
      'room-videos': roomVideoPaths,
    });

    withdrawStage = 'remove_storage_objects';
    await removeStoragePaths(supabase, 'profile-photos', storagePaths['profile-photos']);
    await removeStoragePaths(supabase, 'room-videos', storagePaths['room-videos']);

    if (teamIds.length > 0) {
      withdrawStage = 'cancel_waiting_teams';
      const { error: queueCancelError } = await supabase
        .from('match_queue')
        .update({ status: 'cancelled' })
        .in('team_id', teamIds)
        .eq('status', 'waiting');

      if (queueCancelError) {
        throw queueCancelError;
      }

      const { error: teamDisbandError } = await supabase
        .from('team')
        .update({ disbanded_at: withdrawnAt, status: 'disbanded' })
        .in('id', teamIds)
        .in('status', ['forming', 'ready', 'matching']);

      if (teamDisbandError) {
        throw teamDisbandError;
      }
    }

    if (activeRoomIds.length > 0) {
      withdrawStage = 'leave_active_rooms';
      const { error: leaveRoomsError } = await supabase
        .from('room_member')
        .update({ left_at: withdrawnAt, status: 'left' })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (leaveRoomsError) {
        throw leaveRoomsError;
      }

      const { error: profileRoomStateError } = await supabase
        .from('profile')
        .update({ is_in_active_room: false, last_room_leave_at: withdrawnAt })
        .eq('user_id', user.id);

      if (profileRoomStateError) {
        throw profileRoomStateError;
      }

      await reconcileRoomsAfterWithdrawal(supabase, activeRoomIds, withdrawnAt);
    }

    const rejoinLockedUntil = new Date(
      Date.now() + IDENTITY_POLICY.rejoinLockDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: lockError } = await supabase.from('identity_rejoin_lock').upsert(
      {
        ci_hash: recentVerification.ci_hash,
        locked_until: rejoinLockedUntil,
        reason: 'withdraw',
        user_id: user.id,
      },
      { onConflict: 'ci_hash,reason' },
    );

    if (lockError) {
      throw lockError;
    }

    const { error: auditError } = await supabase.from('audit').insert({
      action: 'account_withdrawn',
      actor_user_id: user.id,
      detail: {
        detail,
        reason,
        rejoinLockedUntil,
        reauthVerificationId: recentVerification.id,
      },
      target: user.id,
    });

    if (auditError) {
      throw auditError;
    }

    // rejoin-lock·audit 는 이미 기록됐는데 deleteUser 가 실패하면 '반쯤 탈퇴'
    // 상태가 된다 — 별도 stage 로 즉시 식별 가능하게 한다.
    withdrawStage = 'delete_user';
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id, false);
    if (deleteError) {
      throw deleteError;
    }

    withdrawStage = 'reconcile_rooms_after_delete';
    await reconcileRoomsAfterWithdrawal(supabase, activeRoomIds, withdrawnAt);

    return jsonResponse({ ok: true });
  } catch (error) {
    captureEdgeError('withdraw-account', error, {
      stage: withdrawStage,
      status: 500,
      userId,
      tags: { feature: 'account-withdraw', code: 'BAD_REQUEST' },
      extra: { reason: capturedReason },
    });
    const message = error instanceof Error ? error.message : 'failed to withdraw account';
    return codedErrorResponse('BAD_REQUEST', message, 400);
  }
});

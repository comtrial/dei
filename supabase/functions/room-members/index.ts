import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { captureEdgeError } from '../_shared/log.ts';

type RoomMembersPayload = {
  roomId?: unknown;
  targetUserId?: unknown;
};

type RoomMemberRow = {
  joined_at: string;
  left_at: string | null;
  role: string;
  room_id: string;
  status: string;
  user_id: string;
};

type ProfileRow = {
  bio: string | null;
  birth_year: number | null;
  gender: string | null;
  mbti: string | null;
  nickname: string | null;
  photo_url: string | null;
  region: string | null;
  user_id: string;
};

type MemberProfileRow = ProfileRow & {
  bio: string | null;
  birth_year: number | null;
  mbti: string | null;
  region: string | null;
};

function isRemoteUrl(path: string) {
  return /^https?:\/\//i.test(path);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let auth;
  try {
    auth = await getAuthenticatedUser(req);
  } catch (error) {
    captureEdgeError('room-members', error, {
      stage: 'auth',
      status: 401,
      tags: { feature: 'room-members' },
    });
    return errorResponse('unauthenticated', 401);
  }

  let payload: RoomMembersPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('invalid_payload', 400);
  }

  const roomId = payload.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    return errorResponse('invalid_payload', 400);
  }
  const targetUserId =
    typeof payload.targetUserId === 'string' && payload.targetUserId.length > 0
      ? payload.targetUserId
      : null;

  try {
    const { supabase, user } = auth;

    const { data: viewerMember, error: viewerMemberError } = await supabase
      .from('room_member')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (viewerMemberError) throw viewerMemberError;
    if (!viewerMember) return errorResponse('not_room_member', 403);

    const { data: roomMembers, error: membersError } = await supabase
      .from('room_member')
      .select('room_id, user_id, role, status, joined_at, left_at')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    if (membersError) throw membersError;

    const members = (roomMembers ?? []) as RoomMemberRow[];
    const userIds = members.map((member) => member.user_id);
    if (userIds.length === 0) {
      return jsonResponse({ blockedUserIds: [], members: [] });
    }
    const blockScopeUserIds = [...new Set(targetUserId ? [...userIds, targetUserId] : userIds)];

    const [
      { data: profiles, error: profilesError },
      { data: viewerBlockedRows, error: viewerBlockedError },
      { data: blockedViewerRows, error: blockedViewerError },
      { data: targetMember, error: targetMemberError },
      { data: targetProfile, error: targetProfileError },
    ] = await Promise.all([
      supabase
        .from('profile')
        .select('user_id, nickname, gender, birth_year, region, photo_url, bio, mbti')
        .in('user_id', userIds),
      supabase
        .from('block')
        .select('blocked_user_id')
        .eq('blocker_user_id', user.id)
        .in('blocked_user_id', blockScopeUserIds)
        .is('unblocked_at', null),
      supabase
        .from('block')
        .select('blocker_user_id')
        .eq('blocked_user_id', user.id)
        .in('blocker_user_id', blockScopeUserIds)
        .is('unblocked_at', null),
      targetUserId
        ? supabase
            .from('room_member')
            .select('status')
            .eq('room_id', roomId)
            .eq('user_id', targetUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      targetUserId
        ? supabase
            .from('profile')
            .select('user_id, nickname, gender, birth_year, region, photo_url, bio, mbti')
            .eq('user_id', targetUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (profilesError) throw profilesError;
    if (viewerBlockedError) throw viewerBlockedError;
    if (blockedViewerError) throw blockedViewerError;
    if (targetMemberError) throw targetMemberError;
    if (targetProfileError) throw targetProfileError;

    const viewerBlockedIds = new Set(
      (viewerBlockedRows ?? []).map((row: { blocked_user_id: string }) => row.blocked_user_id),
    );
    const blockedBetweenIds = new Set<string>(viewerBlockedIds);
    for (const row of blockedViewerRows ?? []) {
      blockedBetweenIds.add((row as { blocker_user_id: string }).blocker_user_id);
    }

    const profileByUser = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
    );

    const remoteAvatarByUser = new Map<string, string>();
    const photosToSign: { path: string; userId: string }[] = [];
    const profileRowsForSigning = [...((profiles ?? []) as ProfileRow[])];
    const detailedTargetProfile = targetProfile as MemberProfileRow | null;
    if (
      detailedTargetProfile?.photo_url &&
      !profileRowsForSigning.some((profile) => profile.user_id === detailedTargetProfile.user_id)
    ) {
      profileRowsForSigning.push(detailedTargetProfile);
    }

    for (const profile of profileRowsForSigning) {
      if (!profile.photo_url || blockedBetweenIds.has(profile.user_id)) continue;

      if (isRemoteUrl(profile.photo_url)) {
        remoteAvatarByUser.set(profile.user_id, profile.photo_url);
      } else {
        photosToSign.push({ path: profile.photo_url, userId: profile.user_id });
      }
    }

    const signedAvatarByUser = new Map<string, string>(remoteAvatarByUser);
    if (photosToSign.length > 0) {
      const { data: signedRows, error: signedError } = await supabase.storage
        .from('profile-photos')
        .createSignedUrls(photosToSign.map((photo) => photo.path), 60 * 60);

      if (signedError) throw signedError;

      const signedByPath = new Map(
        (signedRows ?? [])
          .filter((row: { path?: string | null; signedUrl?: string | null }) =>
            row.path != null && row.signedUrl != null,
          )
          .map((row: { path?: string | null; signedUrl?: string | null }) => [
            row.path as string,
            row.signedUrl as string,
          ]),
      );

      for (const photo of photosToSign) {
        const signedUrl = signedByPath.get(photo.path);
        if (signedUrl) signedAvatarByUser.set(photo.userId, signedUrl);
      }
    }

    const targetMemberStatus = (targetMember as { status?: string } | null)?.status ?? null;
    const memberProfile =
      targetUserId && targetMemberStatus
        ? {
            memberStatus: targetMemberStatus,
            profile:
              targetMemberStatus === 'active' && detailedTargetProfile
                ? {
                    avatar_url: signedAvatarByUser.get(targetUserId) ?? null,
                    bio: detailedTargetProfile.bio,
                    birth_year: detailedTargetProfile.birth_year,
                    gender: detailedTargetProfile.gender,
                    mbti: detailedTargetProfile.mbti,
                    nickname: detailedTargetProfile.nickname,
                    photo_url: detailedTargetProfile.photo_url,
                    region: detailedTargetProfile.region,
                  }
                : null,
          }
        : null;

    return jsonResponse({
      blockedUserIds: [...viewerBlockedIds],
      memberProfile,
      members: members.map((member) => {
        const profile = profileByUser.get(member.user_id);
        return {
          ...member,
          profile: profile
            ? {
                avatar_url: signedAvatarByUser.get(member.user_id) ?? null,
                bio: profile.bio,
                birth_year: profile.birth_year,
                gender: profile.gender,
                mbti: profile.mbti,
                nickname: profile.nickname,
                photo_url: profile.photo_url,
                region: profile.region,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    captureEdgeError('room-members', error, {
      stage: 'load_room_members',
      status: 500,
      userId: auth.user.id,
      tags: { feature: 'room-members' },
      extra: { roomId },
    });
    return errorResponse('room_members_failed', 500);
  }
});

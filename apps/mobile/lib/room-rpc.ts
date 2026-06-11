import type { Database } from '@dei/api';
import { POLICY, kstDateKey, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { cacheProfilePhotoUrl } from '@/lib/profile-photo-cache';

type VideoRow = Database['public']['Tables']['video']['Row'];
type ProfileRow = Database['public']['Tables']['profile']['Row'];

export type MemberProfile = Pick<
  ProfileRow,
  'nickname' | 'gender' | 'birth_year' | 'region' | 'photo_url' | 'bio' | 'mbti'
> & {
  avatar_url?: string | null;
};

export type RoomMemberWithProfile = Database['public']['Tables']['room_member']['Row'] & {
  profile: MemberProfile | null;
};

export type MemberProfileResult = {
  memberStatus: string;
  profile: MemberProfile | null;
};

type RoomMembersBundle = {
  blockedUserIds?: string[];
  memberProfile?: MemberProfileResult | null;
  members: RoomMemberWithProfile[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function primeAvatarCache(members: RoomMemberWithProfile[]) {
  await Promise.all(
    members.map((member) => {
      const path = member.profile?.photo_url;
      const url = member.profile?.avatar_url;
      return path && url
        ? cacheProfilePhotoUrl({ path, url, userId: member.user_id })
        : Promise.resolve();
    }),
  );
}

async function getRoomMembersBundle(
  roomId: string,
  targetUserId?: string,
): Promise<RoomMembersBundle | null> {
  const { data, error } = await supabase.functions.invoke<RoomMembersBundle>('room-members', {
    body: targetUserId ? { roomId, targetUserId } : { roomId },
  });

  if (error || !data?.members) {
    logger.captureMessage('room-members edge fallback', 'warning', {
      tags: { feature: 'room_rpc', rpc: 'room-members', room_id: roomId },
      extra: { reason: error ? getErrorMessage(error) : 'empty response' },
    });
    return null;
  }

  await primeAvatarCache(data.members);
  return data;
}

async function getRoomMembersWithProfileDirect(
  roomId: string,
): Promise<RoomMemberWithProfile[]> {
  const { data: members, error: membersError } = await supabase
    .from('room_member')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'active');
  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profile')
    .select('user_id, nickname, gender, birth_year, region, photo_url, bio, mbti')
    .in('user_id', userIds);
  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.user_id,
      {
        avatar_url: null,
        bio: p.bio,
        birth_year: p.birth_year,
        nickname: p.nickname,
        gender: p.gender,
        mbti: p.mbti,
        photo_url: p.photo_url,
        region: p.region,
      },
    ]),
  );

  return members.map((m) => ({
    ...m,
    profile: profileMap.get(m.user_id) ?? null,
  }));
}

export async function getRoomVideos(
  roomId: string,
  hourFrom: number,
  hourTo: number,
): Promise<VideoRow[]> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('*')
      .eq('room_id', roomId)
      .gte('hour_slot', hourFrom)
      .lte('hour_slot', hourTo)
      .eq('status', 'ready')
      .order('hour_slot', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_videos', room_id: roomId },
      extra: { hourFrom, hourTo },
    });
    return [];
  }
}

/**
 * 날짜 범위 [fromMs, toMsExclusive) 안에서 ready 영상이 1개라도 존재하는
 * KST 날짜 키('YYYY-MM-DD') 집합을 반환한다. 캘린더에 "영상 있는 날" 점을
 * 찍기 위한 경량 조회 — created_at 만 select 한다.
 * 실패 시 빈 Set 을 반환해 캘린더는 점 없이 정상 동작한다.
 */
export async function getRoomVideoDates(
  roomId: string,
  fromMs: number,
  toMsExclusive: number,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('created_at')
      .eq('room_id', roomId)
      .eq('status', 'ready')
      .gte('created_at', new Date(fromMs).toISOString())
      .lt('created_at', new Date(toMsExclusive).toISOString());

    if (error) throw error;

    const keys = new Set<string>();
    for (const row of data ?? []) {
      if (!row.created_at) continue;
      keys.add(kstDateKey(new Date(row.created_at).getTime()));
    }
    return keys;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_video_dates', room_id: roomId },
      extra: { fromMs, toMsExclusive },
    });
    return new Set();
  }
}

/**
 * 날짜 범위 [fromMs, toMsExclusive) 안에서 ready 영상이 1개라도 존재하는
 * hour_slot 집합을 반환한다. 시간 스트립 위 점 표시용 경량 조회다.
 */
export async function getRoomVideoHours(
  roomId: string,
  fromMs: number,
  toMsExclusive: number,
): Promise<Set<number>> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('hour_slot, created_at')
      .eq('room_id', roomId)
      .eq('status', 'ready')
      .gte('created_at', new Date(fromMs).toISOString())
      .lt('created_at', new Date(toMsExclusive).toISOString());

    if (error) throw error;

    const hours = new Set<number>();
    for (const row of data ?? []) {
      if (typeof row.hour_slot === 'number') {
        hours.add(row.hour_slot);
        continue;
      }

      if (row.created_at) {
        hours.add(new Date(row.created_at).getHours());
      }
    }
    return hours;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_video_hours', room_id: roomId },
      extra: { fromMs, toMsExclusive },
    });
    return new Set();
  }
}

export async function getSelfVideoCount24h(
  roomId: string,
  selfUserId: string,
): Promise<number> {
  try {
    const windowHours = POLICY.blurGate.visibilityWindowHours;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('video')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('user_id', selfUserId)
      .gte('created_at', since)
      .eq('status', 'ready');
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_self_video_count_24h', room_id: roomId },
    });
    return 0;
  }
}

export async function getRoomMembersWithProfile(
  roomId: string,
): Promise<RoomMemberWithProfile[]> {
  try {
    const bundle = await getRoomMembersBundle(roomId);
    if (bundle) return bundle.members;

    return await getRoomMembersWithProfileDirect(roomId);
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_members_with_profile', room_id: roomId },
    });
    return [];
  }
}

export async function getRoomMembersSnapshot(
  roomId: string,
  selfUserId: string,
): Promise<{ blockedUserIds: Set<string>; members: RoomMemberWithProfile[] }> {
  try {
    const bundle = await getRoomMembersBundle(roomId);
    if (bundle) {
      return {
        blockedUserIds: new Set(bundle.blockedUserIds ?? []),
        members: bundle.members,
      };
    }

    const [members, blockedUserIds] = await Promise.all([
      getRoomMembersWithProfileDirect(roomId),
      getBlockedUserIds(selfUserId),
    ]);
    return { blockedUserIds, members };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_members_snapshot', room_id: roomId },
    });
    return { blockedUserIds: new Set(), members: [] };
  }
}

export async function getBlockedUserIds(selfUserId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('block')
      .select('blocked_user_id')
      .eq('blocker_user_id', selfUserId)
      .is('unblocked_at', null);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.blocked_user_id));
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_blocked_user_ids' },
    });
    return new Set();
  }
}

export async function getVideoById(videoId: string): Promise<VideoRow | null> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('*')
      .eq('id', videoId)
      .single();
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_video_by_id', video_id: videoId },
    });
    return null;
  }
}

export async function getSiblingVideos(
  roomId: string,
  hourSlot: number,
): Promise<VideoRow[]> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('*')
      .eq('room_id', roomId)
      .eq('hour_slot', hourSlot)
      .eq('status', 'ready')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_sibling_videos', room_id: roomId },
      extra: { hourSlot },
    });
    return [];
  }
}

export async function getMemberProfile(
  userId: string,
  roomId: string,
): Promise<MemberProfileResult | null> {
  try {
    const bundle = await getRoomMembersBundle(roomId, userId);
    if (bundle && Object.prototype.hasOwnProperty.call(bundle, 'memberProfile')) {
      const profile = bundle.memberProfile?.profile;
      if (profile?.photo_url && profile.avatar_url) {
        await cacheProfilePhotoUrl({
          path: profile.photo_url,
          url: profile.avatar_url,
          userId,
        });
      }
      return bundle.memberProfile ?? null;
    }

    const { data: member, error: memberError } = await supabase
      .from('room_member')
      .select('status')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (memberError) throw memberError;
    if (!member) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profile')
      .select('nickname, gender, birth_year, region, photo_url, bio, mbti')
      .eq('user_id', userId)
      .single();

    if (profileError) throw profileError;

    return {
      memberStatus: member.status,
      profile: profile ? { ...profile, avatar_url: null } : null,
    };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_member_profile', room_id: roomId },
      extra: { userId },
    });
    return null;
  }
}

export async function isBlockedBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_blocked_between', {
      a: userA,
      b: userB,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'is_blocked_between' },
    });
    return false;
  }
}

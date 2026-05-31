import type { Database } from '@dei/api';
import { POLICY, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

type VideoRow = Database['public']['Tables']['video']['Row'];
type ProfileRow = Database['public']['Tables']['profile']['Row'];

export type RoomMemberWithProfile = Database['public']['Tables']['room_member']['Row'] & {
  profile: Pick<ProfileRow, 'nickname' | 'gender' | 'photo_url'> | null;
};

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
      .select('user_id, nickname, gender, photo_url')
      .in('user_id', userIds);
    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, { nickname: p.nickname, gender: p.gender, photo_url: p.photo_url }]),
    );

    return members.map((m) => ({
      ...m,
      profile: profileMap.get(m.user_id) ?? null,
    }));
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_members_with_profile', room_id: roomId },
    });
    return [];
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

/**
 * Groups (묶음) 도메인 service — Edge Function wrapper.
 */
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

type EdgeError = { error?: string; retryable?: boolean };

function unwrapEdgeError(err: unknown, fallback: string): Error & { retryable?: boolean } {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; context?: { json?: EdgeError } };
    const detail = e.context?.json?.error;
    const final = new Error(detail || e.message || fallback);
    (final as { retryable?: boolean }).retryable = e.context?.json?.retryable;
    return final;
  }
  return new Error(fallback);
}

// ============================================================================
// Edge: groups-create / disband / match-enqueue
// ============================================================================

export async function createGroup(nicknames: string[]): Promise<{ groupId: string }> {
  const { data, error } = await supabase.functions.invoke<{ groupId: string }>(
    'groups-create',
    { body: { nicknames } },
  );
  if (error || !data?.groupId) {
    const captured = unwrapEdgeError(error, 'failed to create group');
    logger.captureException(captured, {
      tags: { feature: 'group', action: 'create' },
      extra: { invitees: nicknames.length },
    });
    throw captured;
  }
  return data;
}

export async function enqueueGroupForMatch(groupId: string): Promise<{ queueId: string }> {
  const { data, error } = await supabase.functions.invoke<{ queueId: string }>(
    'match-enqueue',
    { body: { groupId } },
  );
  if (error || !data?.queueId) {
    const captured = unwrapEdgeError(error, 'failed to enqueue group');
    logger.captureException(captured, {
      tags: { feature: 'group', action: 'enqueue' },
      extra: { groupId },
    });
    throw captured;
  }
  return data;
}

/** 묶음 해체 — leader 본인이 forming 상태일 때만. RPC 직접 호출 (Edge 미노출). */
export async function disbandGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('disband_group', { p_group_id: groupId });
  if (error) {
    logger.captureException(error, {
      tags: { feature: 'group', action: 'disband' },
      extra: { groupId },
    });
    throw error;
  }
}

// ============================================================================
// Read — group/group_members/match_queue 직접 select (RLS 통과)
// ============================================================================

export type GroupView = {
  id: string;
  leaderId: string;
  size: number;
  status: 'forming' | 'queued' | 'matched' | 'disbanded';
  matchedRoomId: string | null;
  createdAt: string;
};

export type GroupMemberView = {
  groupId: string;
  profileId: string;
  role: 'leader' | 'member';
  nickname: string | null;
  isInActiveRoom: boolean;
};

export async function fetchMyForming(): Promise<GroupView | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('groups')
    .select('id, leader_id, size, status, matched_room_id, created_at')
    .eq('leader_id', user.id)
    .in('status', ['forming', 'queued'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.captureException(error, { tags: { feature: 'group', action: 'fetch-forming' } });
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    leaderId: data.leader_id,
    size: data.size,
    status: data.status as GroupView['status'],
    matchedRoomId: data.matched_room_id,
    createdAt: data.created_at,
  };
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMemberView[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, profile_id, role, profiles!inner(nickname, is_in_active_room)')
    .eq('group_id', groupId);

  if (error) {
    logger.captureException(error, { tags: { feature: 'group', action: 'fetch-members' } });
    return [];
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles as {
      nickname: string | null;
      is_in_active_room: boolean;
    } | null;
    return {
      groupId: row.group_id,
      profileId: row.profile_id,
      role: row.role as 'leader' | 'member',
      nickname: profile?.nickname ?? null,
      isInActiveRoom: Boolean(profile?.is_in_active_room),
    };
  });
}

/** 닉네임으로 다른 가입자 검색 — invite-search.tsx 가 사용. */
export type NicknameSearchResult = {
  userId: string;
  nickname: string;
  isInActiveRoom: boolean;
};

export async function searchProfileByNickname(
  prefix: string,
): Promise<NicknameSearchResult[]> {
  const trimmed = prefix.trim().toLowerCase();
  if (trimmed.length < 1) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, nickname, is_in_active_room, nickname_lower')
    .ilike('nickname_lower', `${trimmed}%`)
    .limit(20);

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'group', action: 'search-nickname' },
    });
    return [];
  }

  return (data ?? [])
    .filter((row): row is { user_id: string; nickname: string; is_in_active_room: boolean; nickname_lower: string } =>
      typeof row.nickname === 'string' && row.nickname.length > 0,
    )
    .map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      isInActiveRoom: row.is_in_active_room,
    }));
}

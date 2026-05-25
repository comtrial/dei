/**
 * useRoomMembers — 방 멤버 목록 + profiles join + realtime 멤버 변경 구독.
 *
 * RLS 가 차단 양방향 가시성을 자동 적용하므로 클라는 별도 필터 불필요
 * (`v_block_pairs` 가 select 단계에서 걸러줌).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type RoomMemberWithProfile = {
  roomId: string;
  profileId: string;
  status: 'active' | 'left' | 'auto_kicked';
  joinedAt: string;
  leftAt: string | null;
  nickname: string | null;
  gender: string | null;
};

type Row = {
  room_id: string;
  profile_id: string;
  status: string;
  joined_at: string;
  left_at: string | null;
  profiles: { nickname: string | null; gender: string | null } | null;
};

function toMember(row: Row): RoomMemberWithProfile {
  return {
    roomId: row.room_id,
    profileId: row.profile_id,
    status: row.status as RoomMemberWithProfile['status'],
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    nickname: row.profiles?.nickname ?? null,
    gender: row.profiles?.gender ?? null,
  };
}

export function useRoomMembers(roomId: string | null | undefined) {
  const [members, setMembers] = useState<RoomMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, profile_id, status, joined_at, left_at, profiles!inner(nickname, gender)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      logger.captureException(error, {
        tags: { feature: 'rooms', action: 'fetch-members' },
        extra: { roomId },
      });
      setMembers([]);
    } else {
      setMembers((data ?? []).map((r) => toMember(r as unknown as Row)));
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`room-members-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'room_members' },
        () => {
          void refresh();
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId, refresh]);

  return { members, loading, refresh };
}

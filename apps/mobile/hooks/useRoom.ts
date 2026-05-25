/**
 * useRoom — 방 메타데이터 + status realtime 구독.
 *
 * UX 의 분기 (active vs ended) 가 status 한 컬럼에 달려있으므로 realtime
 * 으로 ended/archived 전환을 즉시 반영한다.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import type { RoomSummary } from '@/lib/rooms/types';

function toSummary(row: {
  id: string;
  status: string;
  expires_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  member_count: number;
  active_member_count: number;
}): RoomSummary {
  return {
    id: row.id,
    status: row.status as RoomSummary['status'],
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
    endedReason: row.ended_reason as RoomSummary['endedReason'],
    memberCount: row.member_count,
    activeMemberCount: row.active_member_count,
  };
}

export function useRoom(roomId: string | null | undefined) {
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, status, expires_at, ended_at, ended_reason, member_count, active_member_count')
        .eq('id', roomId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        logger.captureException(error, {
          tags: { feature: 'rooms', action: 'fetch-room' },
          extra: { roomId },
        });
        setRoom(null);
      } else {
        setRoom(data ? toSummary(data) : null);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`room-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', filter: `id=eq.${roomId}`, schema: 'public', table: 'rooms' },
        (payload) => {
          if (alive && payload.new) {
            setRoom(toSummary(payload.new as Parameters<typeof toSummary>[0]));
          }
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      alive = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId]);

  return { room, loading };
}

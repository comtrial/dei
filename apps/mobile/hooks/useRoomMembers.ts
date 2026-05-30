import { useCallback, useEffect, useRef, useState } from 'react';

import type { Database } from '@dei/api';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomMembers } from '@/lib/realtime';

type RoomMemberRow = Database['public']['Tables']['room_member']['Row'];

export function useRoomMembers(roomId: string): {
  members: RoomMemberRow[];
  loading: boolean;
  refetch: () => void;
} {
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('room_member')
        .select('*')
        .eq('room_id', roomId)
        .eq('status', 'active');
      if (error) throw error;
      setMembers((data as RoomMemberRow[]) ?? []);
    } catch (err) {
      logger.captureException(err, { tags: { feature: 'room_members', room_id: roomId } });
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    void fetchMembers();

    const unsub = subscribeRoomMembers(roomId, (row) => {
      const updated = row as RoomMemberRow;
      setMembers((prev) => {
        const idx = prev.findIndex(
          (m) => m.user_id === updated.user_id && m.room_id === updated.room_id,
        );
        if (idx === -1) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    });

    return unsub;
  }, [roomId, fetchMembers]);

  return { members, loading, refetch: fetchMembers };
}

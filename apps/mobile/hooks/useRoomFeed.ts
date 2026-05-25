/**
 * useRoomFeed — 방 단위 24h 분할 피드 (`hourly_uploads`) + realtime.
 *
 * RLS 가 (a) 본인 업로드 (b) 같은 방 active + 24h 윈도우 + 블러게이트 통과 +
 * 차단 양방향 통과 를 자동 필터링한다. 클라는 단순히 SELECT.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import type { FeedCell } from '@/lib/rooms/types';

type Row = {
  id: string;
  profile_id: string;
  room_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  duration_ms: number;
  hour_slot: number;
  slot_date: string;
  uploaded_at: string;
};

function toCell(row: Row): FeedCell {
  return {
    uploadId: row.id,
    profileId: row.profile_id,
    roomId: row.room_id,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    durationMs: row.duration_ms,
    hourSlot: row.hour_slot,
    slotDate: row.slot_date,
    uploadedAt: row.uploaded_at,
  };
}

export function useRoomFeed(roomId: string | null | undefined) {
  const [cells, setCells] = useState<FeedCell[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) {
      setCells([]);
      setLoading(false);
      return;
    }

    // 24h 내 + archived 가 아닌 것만.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('hourly_uploads')
      .select(
        'id, profile_id, room_id, storage_path, thumbnail_path, duration_ms, hour_slot, slot_date, uploaded_at',
      )
      .eq('room_id', roomId)
      .is('archived_at', null)
      .gte('uploaded_at', since)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logger.captureException(error, {
        tags: { feature: 'rooms', action: 'fetch-feed' },
        extra: { roomId },
      });
      setCells([]);
    } else {
      setCells((data ?? []).map((r) => toCell(r as Row)));
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`room-feed-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `room_id=eq.${roomId}`,
          schema: 'public',
          table: 'hourly_uploads',
        },
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

  return { cells, loading, refresh };
}

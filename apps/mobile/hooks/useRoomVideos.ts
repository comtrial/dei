import { useCallback, useEffect, useRef, useState } from 'react';

import type { Database } from '@dei/api';
import { POLICY, analytics, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getRoomVideos } from '@/lib/room-rpc';
import { subscribeRoomVideos } from '@/lib/realtime';

type VideoRow = Database['public']['Tables']['video']['Row'];

type VideoCache = Record<number, VideoRow[]>;

export function useRoomVideos(
  roomId: string,
  currentHour: number,
  hourRange: number,
): {
  videosByHour: VideoCache;
  loading: boolean;
  refetch: () => void;
} {
  const [videosByHour, setVideosByHour] = useState<VideoCache>({});
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<VideoRow[]>([]);

  const hourFrom = Math.max(0, currentHour - hourRange);
  const hourTo = Math.min(23, currentHour + hourRange);

  const fetchVideos = useCallback(async () => {
    try {
      const rows = await getRoomVideos(roomId, hourFrom, hourTo);
      const byHour: VideoCache = {};
      for (const row of rows) {
        const slot = row.hour_slot ?? currentHour;
        if (!byHour[slot]) byHour[slot] = [];
        byHour[slot].push(row);
      }
      setVideosByHour(byHour);
    } catch (err) {
      logger.captureException(err, { tags: { feature: 'room_videos', room_id: roomId } });
    } finally {
      setLoading(false);
    }
  }, [roomId, hourFrom, hourTo, currentHour]);

  const flushPatch = useCallback(() => {
    const patches = pendingPatchRef.current.splice(0);
    if (patches.length === 0) return;
    setVideosByHour((prev) => {
      const next = { ...prev };
      for (const v of patches) {
        const slot = v.hour_slot ?? 0;
        const existing = next[slot] ?? [];
        const idx = existing.findIndex((x) => x.id === v.id);
        if (idx === -1) {
          next[slot] = [...existing, v];
        } else {
          const updated = [...existing];
          updated[idx] = v;
          next[slot] = updated;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchVideos();

    const unsub = subscribeRoomVideos(roomId, (row) => {
      const receivedAt = Date.now();
      const video = row as VideoRow;

      const expectedAt =
        typeof video.created_at === 'string' ? new Date(video.created_at).getTime() : receivedAt;
      analytics.capture(ANALYTICS_EVENTS.room_grid_realtime_lag, {
        room_id: roomId,
        expected_at: expectedAt,
        received_at: receivedAt,
        lag_ms: receivedAt - expectedAt,
      });

      pendingPatchRef.current.push(video);

      if (debounceTimerRef.current !== null) return;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        flushPatch();
      }, POLICY.gridPerformance.realtimeDebounceMs);
    });

    return () => {
      unsub();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [roomId, fetchVideos, flushPatch]);

  return { videosByHour, loading, refetch: fetchVideos };
}

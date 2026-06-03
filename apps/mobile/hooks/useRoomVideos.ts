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
  selectedDate?: Date,
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

  const dayStartMs = selectedDate
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime()
    : null;
  const dayEndMs = dayStartMs !== null ? dayStartMs + 24 * 60 * 60 * 1000 : null;

  const fetchVideos = useCallback(async () => {
    try {
      const rows = await getRoomVideos(roomId, hourFrom, hourTo);
      const filtered =
        dayStartMs !== null && dayEndMs !== null
          ? rows.filter((r) => {
              if (!r.created_at) return false;
              const t = new Date(r.created_at).getTime();
              return t >= dayStartMs && t < dayEndMs;
            })
          : rows;
      const byHour: VideoCache = {};
      for (const row of filtered) {
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
  }, [roomId, hourFrom, hourTo, currentHour, dayStartMs, dayEndMs]);

  const flushPatch = useCallback(() => {
    const patches = pendingPatchRef.current.splice(0);
    if (patches.length === 0) return;
    setVideosByHour((prev) => {
      const next = { ...prev };
      for (const v of patches) {
        if (dayStartMs !== null && dayEndMs !== null && v.created_at) {
          const t = new Date(v.created_at).getTime();
          if (t < dayStartMs || t >= dayEndMs) continue;
        }
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
  }, [dayStartMs, dayEndMs]);

  useEffect(() => {
    setLoading(true);
    void fetchVideos();

    let unsub: () => void = () => {};
    try {
      unsub = subscribeRoomVideos(roomId, (row) => {
        try {
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
        } catch (err) {
          logger.captureException(err, {
            tags: { feature: 'room_videos', step: 'realtime-insert', room_id: roomId },
          });
        }
      });
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'room_videos', step: 'realtime-subscribe', room_id: roomId },
      });
    }

    return () => {
      try {
        unsub();
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'room_videos', step: 'realtime-unsub', room_id: roomId },
        });
      }
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [roomId, fetchVideos, flushPatch]);

  return { videosByHour, loading, refetch: fetchVideos };
}

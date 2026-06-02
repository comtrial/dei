import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';

import { POLICY, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export function roomChannelName(roomId: string): string {
  return `room:${roomId}`;
}

export function roomChannel(roomId: string, selfUserId?: string): RealtimeChannel {
  return supabase.channel(roomChannelName(roomId), {
    config: {
      presence: selfUserId ? { key: selfUserId } : undefined,
    },
  });
}

function uniqueChannelName(base: string): string {
  return `${base}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribeRoomMessages(
  roomId: string,
  onInsert: (row: Record<string, unknown>) => void,
): () => void {
  try {
    const channelName = uniqueChannelName(`room:${roomId}:messages`);
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` },
        (payload) => {
          try {
            onInsert(payload.new as Record<string, unknown>);
          } catch (err) {
            logger.captureException(err, {
              tags: { feature: 'realtime', sub_feature: 'messages', step: 'on-insert' },
              extra: { roomId },
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.captureMessage(`realtime: room ${roomId} message 구독 ${status}`, 'warning', {
            tags: { feature: 'realtime', room_id: roomId },
          });
        }
      });

    return () => {
      try {
        void supabase.removeChannel(channel);
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'realtime', sub_feature: 'messages', step: 'cleanup' },
          extra: { roomId },
        });
      }
    };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'realtime', sub_feature: 'messages', step: 'subscribe' },
      extra: { roomId },
    });
    return () => {};
  }
}

const BACKOFF_STEPS_MS = [1000, 2000, 5000, 30000] as const;

function withBackoffSubscribe(
  channel: RealtimeChannel,
  roomId: string,
  feature: string,
): RealtimeChannel {
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      attempt = 0;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      logger.captureMessage(`realtime: room ${roomId} ${feature} 구독 ${status}`, 'warning', {
        tags: { feature: 'realtime', room_id: roomId, sub_feature: feature },
      });
      const delayMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(() => {
        void channel.subscribe();
      }, delayMs);
    }
  });

  const originalRemove = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    void supabase.removeChannel(channel);
  };

  (channel as RealtimeChannel & { _deiCleanup?: () => void })._deiCleanup = originalRemove;
  return channel;
}

export function subscribeRoomVideos(
  roomId: string,
  onInsert: (row: Record<string, unknown>) => void,
): () => void {
  try {
    const channelName = uniqueChannelName(`room:${roomId}:videos`);
    const channel = supabase.channel(channelName).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'video', filter: `room_id=eq.${roomId}` },
      (payload) => {
        try {
          onInsert(payload.new as Record<string, unknown>);
        } catch (err) {
          logger.captureException(err, {
            tags: { feature: 'realtime', sub_feature: 'videos', step: 'on-insert' },
            extra: { roomId },
          });
        }
      },
    );
    withBackoffSubscribe(channel, roomId, 'videos');
    return () => {
      try {
        (channel as RealtimeChannel & { _deiCleanup?: () => void })._deiCleanup?.();
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'realtime', sub_feature: 'videos', step: 'cleanup' },
          extra: { roomId },
        });
      }
    };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'realtime', sub_feature: 'videos', step: 'subscribe' },
      extra: { roomId },
    });
    return () => {};
  }
}

export function subscribeRoomMembers(
  roomId: string,
  onUpdate: (row: Record<string, unknown>) => void,
): () => void {
  try {
    const channelName = uniqueChannelName(`room:${roomId}:members`);
    const channel = supabase.channel(channelName).on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'room_member', filter: `room_id=eq.${roomId}` },
      (payload) => {
        try {
          onUpdate(payload.new as Record<string, unknown>);
        } catch (err) {
          logger.captureException(err, {
            tags: { feature: 'realtime', sub_feature: 'members', step: 'on-update' },
            extra: { roomId },
          });
        }
      },
    );
    withBackoffSubscribe(channel, roomId, 'members');
    return () => {
      try {
        (channel as RealtimeChannel & { _deiCleanup?: () => void })._deiCleanup?.();
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'realtime', sub_feature: 'members', step: 'cleanup' },
          extra: { roomId },
        });
      }
    };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'realtime', sub_feature: 'members', step: 'subscribe' },
      extra: { roomId },
    });
    return () => {};
  }
}

export type PresenceSyncHandler = (state: RealtimePresenceState<{ user_id: string }>) => void;

export function subscribeRoomPresence(
  roomId: string,
  selfUserId: string,
  onSync: PresenceSyncHandler,
): () => void {
  const presenceThrottleMs = POLICY.gridPerformance.realtimeDebounceMs * 2;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    const channelName = uniqueChannelName(`room:${roomId}:presence`);
    const channel = supabase.channel(channelName, {
      config: { presence: { key: selfUserId } },
    })
      .on('presence', { event: 'sync' }, () => {
        if (throttleTimer !== null) return;
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          try {
            onSync(channel.presenceState<{ user_id: string }>());
          } catch (err) {
            logger.captureException(err, {
              tags: { feature: 'realtime', sub_feature: 'presence', step: 'on-sync' },
              extra: { roomId },
            });
          }
        }, presenceThrottleMs);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: selfUserId });
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.captureMessage(`realtime: room ${roomId} presence 구독 ${status}`, 'warning', {
            tags: { feature: 'realtime', room_id: roomId, sub_feature: 'presence' },
          });
        }
      });

    return () => {
      if (throttleTimer !== null) clearTimeout(throttleTimer);
      try {
        void supabase.removeChannel(channel);
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'realtime', sub_feature: 'presence', step: 'cleanup' },
          extra: { roomId },
        });
      }
    };
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'realtime', sub_feature: 'presence', step: 'subscribe' },
      extra: { roomId },
    });
    return () => {
      if (throttleTimer !== null) clearTimeout(throttleTimer);
    };
  }
}

/**
 * 방 `room` 행 UPDATE(상태 전이: active→ended/deleted)를 구독한다.
 * 방이 종료되면 채팅 시트를 읽기전용으로 전환하기 위한 신호(concurrency-misc-9).
 * 반환된 unsubscribe 를 effect cleanup 에서 반드시 호출한다(구독 누수 방지).
 */
export function subscribeRoomStatus(
  roomId: string,
  onUpdate: (row: Record<string, unknown>) => void,
): () => void {
  const channel = roomChannel(roomId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'room', filter: `id=eq.${roomId}` },
      (payload) => onUpdate(payload.new as Record<string, unknown>),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logger.captureMessage(`realtime: room ${roomId} status 구독 ${status}`, 'warning', {
          tags: { feature: 'realtime', room_id: roomId },
        });
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

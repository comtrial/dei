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

export function subscribeRoomMessages(
  roomId: string,
  onInsert: (row: Record<string, unknown>) => void,
): () => void {
  const channel = roomChannel(roomId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new as Record<string, unknown>),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logger.captureMessage(`realtime: room ${roomId} message 구독 ${status}`, 'warning', {
          tags: { feature: 'realtime', room_id: roomId },
        });
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
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
  const channel = roomChannel(roomId).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'video', filter: `room_id=eq.${roomId}` },
    (payload) => onInsert(payload.new as Record<string, unknown>),
  );
  withBackoffSubscribe(channel, roomId, 'videos');
  return () => {
    (channel as RealtimeChannel & { _deiCleanup?: () => void })._deiCleanup?.();
  };
}

export function subscribeRoomMembers(
  roomId: string,
  onUpdate: (row: Record<string, unknown>) => void,
): () => void {
  const channel = roomChannel(roomId).on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'room_member', filter: `room_id=eq.${roomId}` },
    (payload) => onUpdate(payload.new as Record<string, unknown>),
  );
  withBackoffSubscribe(channel, roomId, 'members');
  return () => {
    (channel as RealtimeChannel & { _deiCleanup?: () => void })._deiCleanup?.();
  };
}

export type PresenceSyncHandler = (state: RealtimePresenceState<{ user_id: string }>) => void;

export function subscribeRoomPresence(
  roomId: string,
  selfUserId: string,
  onSync: PresenceSyncHandler,
): () => void {
  const presenceThrottleMs = POLICY.gridPerformance.realtimeDebounceMs * 2;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const channel = roomChannel(roomId, selfUserId)
    .on('presence', { event: 'sync' }, () => {
      if (throttleTimer !== null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        onSync(channel.presenceState<{ user_id: string }>());
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
    void supabase.removeChannel(channel);
  };
}

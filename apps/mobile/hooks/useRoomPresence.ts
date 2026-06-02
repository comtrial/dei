import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeRoomPresence } from '@/lib/realtime';

export function useRoomPresence(
  roomId: string,
  options?: { selfUserId?: string | null },
): {
  onlineUserIds: Set<string>;
  useIsUserOnline: (userId: string) => boolean;
  iAmOnline: boolean;
} {
  const selfUserId = options?.selfUserId ?? null;
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selfUserId) return;

    const unsub = subscribeRoomPresence(roomId, selfUserId, (state) => {
      const ids = new Set<string>();
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          if (p.user_id) ids.add(p.user_id);
        }
      }
      setOnlineUserIds(ids);
    });

    return unsub;
  }, [roomId, selfUserId]);

  const onlineRef = useRef(onlineUserIds);
  onlineRef.current = onlineUserIds;

  const useIsUserOnline = useCallback(
    (userId: string): boolean => onlineRef.current.has(userId),
    [],
  );

  const iAmOnline = useMemo(
    () => (selfUserId != null ? onlineUserIds.has(selfUserId) : false),
    [onlineUserIds, selfUserId],
  );

  return { onlineUserIds, useIsUserOnline, iAmOnline };
}

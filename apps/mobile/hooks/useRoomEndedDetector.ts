import { useEffect, useRef } from 'react';

import type { Database } from '@dei/api';
import { POLICY, analytics } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';

type RoomMemberRow = Database['public']['Tables']['room_member']['Row'];

// TODO(C-0b §2-1 broadcast 합의 후 제거): 클라 폴백 로직
export function useRoomEndedDetector(
  roomId: string,
  members: RoomMemberRow[],
  options: {
    selfUserId: string;
    onRoomEnded: () => void;
  },
): void {
  const { selfUserId, onRoomEnded } = options;
  const onRoomEndedRef = useRef(onRoomEnded);
  onRoomEndedRef.current = onRoomEnded;

  const firedRef = useRef(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firedRef.current) return;

    const activeCount = members.filter((m) => m.status === 'active').length;

    if (activeCount === 0) {
      if (graceTimerRef.current !== null) return;

      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = null;
        if (firedRef.current) return;
        firedRef.current = true;

        analytics.capture(ANALYTICS_EVENTS.room_closed_last_member_left, {
          room_id: roomId,
          self_user_id: selfUserId,
        });

        onRoomEndedRef.current();
      }, POLICY.room.roomEndedGraceMs);
    } else {
      if (graceTimerRef.current !== null) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    }
  }, [members, roomId, selfUserId]);

  useEffect(() => {
    return () => {
      if (graceTimerRef.current !== null) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, []);
}

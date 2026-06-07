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
  // 본인이 한 번이라도 이 방의 active 멤버로 확인된 적 있는가.
  // members 가 초기/refetch/포그라운드 복귀로 *일시적으로 비는* 윈도우에서
  // 본인이 방에 멀쩡히 있는데도 ended 로 오판해 splash→홈으로 빠지던 버그 방지.
  // (본인을 보기 전의 빈 배열 = 아직 로딩 → 판정 보류.)
  const hasSeenSelfActiveRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    const selfActive = members.some(
      (m) => m.user_id === selfUserId && m.status === 'active',
    );
    if (selfActive) {
      hasSeenSelfActiveRef.current = true;
    }

    // ended 후보 = "본인이 active 목록에 없다". 단 본인을 *한 번이라도* active 로
    // 본 뒤에만 신뢰한다(초기 로딩 빈 배열 무시). 전체 activeCount 가 아니라
    // 본인 active 여부로 판정 → 다른 멤버 일시 누락·refetch 빈 윈도우 무영향.
    const selfGone = hasSeenSelfActiveRef.current && !selfActive;

    if (selfGone) {
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

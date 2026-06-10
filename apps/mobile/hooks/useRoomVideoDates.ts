import { useEffect, useState } from 'react';

import { getRoomVideoDates } from '@/lib/room-rpc';

export interface RoomVideoDateRange {
  fromMs: number;
  toMsExclusive: number;
}

/**
 * 캘린더에 "영상 있는 날" 점을 찍기 위해, 주어진 날짜 범위 안에서 영상이
 * 존재하는 KST 날짜 키 집합을 조회한다. `enabled` 가 true 가 되는 순간(캘린더가
 * 열릴 때) 1회 조회하고, 닫혀 있을 땐 쿼리하지 않는다.
 */
export function useRoomVideoDates(
  roomId: string,
  range: RoomVideoDateRange,
  enabled: boolean,
): { dateKeys: Set<string>; loading: boolean } {
  const [dateKeys, setDateKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const { fromMs, toMsExclusive } = range;

  useEffect(() => {
    if (!enabled || !roomId) return;

    let cancelled = false;
    setLoading(true);
    void getRoomVideoDates(roomId, fromMs, toMsExclusive).then((keys) => {
      if (cancelled) return;
      setDateKeys(keys);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, roomId, fromMs, toMsExclusive]);

  return { dateKeys, loading };
}

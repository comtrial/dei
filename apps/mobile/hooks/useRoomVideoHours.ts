import { useEffect, useState } from 'react';

import { getRoomVideoHours } from '@/lib/room-rpc';

function dayRange(date: Date): { fromMs: number; toMsExclusive: number } {
  const fromMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return { fromMs, toMsExclusive: fromMs + 24 * 60 * 60 * 1000 };
}

/**
 * 선택된 날짜에서 영상이 하나라도 있는 hour_slot 집합을 조회한다.
 * 시간 스트립은 24개 슬롯을 모두 보여주므로 기존 영상 목록과 별도로 경량 조회한다.
 */
export function useRoomVideoHours(roomId: string, selectedDate: Date): Set<number> {
  const [hourKeys, setHourKeys] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const { fromMs, toMsExclusive } = dayRange(selectedDate);
    void getRoomVideoHours(roomId, fromMs, toMsExclusive).then((keys) => {
      if (cancelled) return;
      setHourKeys(keys);
    });

    return () => {
      cancelled = true;
    };
  }, [roomId, selectedDate]);

  return hourKeys;
}

/**
 * useRematchCooldown — 24h 재매칭 제한 (D11) + 사용 가능 부스터 개수.
 *
 * cooldown 만료까지 남은 ms 를 1s 단위로 tick 시켜 UI 카운트다운에 사용.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchAvailableBoosterCount,
  fetchMyCooldown,
} from '@/lib/booster/booster-service';

export type RematchCooldownState = {
  /** cooldown 종료 시각 (없으면 null) */
  cooldownUntil: string | null;
  /** cooldown 종료까지 남은 ms (음수면 만료, 0 이면 cooldown 없음) */
  remainingMs: number;
  /** 사용 가능 부스터 개수 (구매 또는 무료 grant) */
  availableBoosters: number;
  /** true 면 자유 재매칭 가능 (cooldown 만료 또는 부스터 있음) */
  canRematch: boolean;
};

export function useRematchCooldown() {
  const [state, setState] = useState<RematchCooldownState>({
    cooldownUntil: null,
    remainingMs: 0,
    availableBoosters: 0,
    canRematch: true,
  });
  const [loading, setLoading] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [cooldown, count] = await Promise.all([
      fetchMyCooldown(),
      fetchAvailableBoosterCount(),
    ]);
    const expired = !cooldown.cooldownUntil || cooldown.remainingMs <= 0;
    setState({
      cooldownUntil: cooldown.cooldownUntil,
      remainingMs: Math.max(0, cooldown.remainingMs),
      availableBoosters: count,
      canRematch: expired || count > 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    tickRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.cooldownUntil) return prev;
        const remaining = new Date(prev.cooldownUntil).getTime() - Date.now();
        const expired = remaining <= 0;
        return {
          ...prev,
          remainingMs: Math.max(0, remaining),
          canRematch: expired || prev.availableBoosters > 0,
        };
      });
    }, 1000);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [refresh]);

  return { state, loading, refresh };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { analytics, logger } from '@dei/shared';

import { getFlag, type FlagKey, type FlagMap, type FlagValue } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type FeatureFlagsContextValue = {
  flags: FlagMap | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

/**
 * 서버 평가 flag 를 로드/노출. 실패해도 flags=null 로 두고 앱은 fallback 으로
 * 동작(앱 죽이지 않음). 앱 포그라운드 복귀 시 refresh 해 시간경과 조건(예: "영상
 * 올린 지 2일")이 갱신되게 한다.
 */
export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [flags, setFlags] = useState<FlagMap | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 마지막으로 $feature_flag_called 를 발송한 flag 값. 매 refresh 마다 같은 값을
  // 중복 발송하지 않고 "변경된 flag" 에 대해서만 1회 노출 이벤트를 보낸다.
  const lastExposed = useRef<FlagMap>({});

  /**
   * 평가된 variant 를 PostHog 로 전달한다.
   *   1) 모든 flag key/value 를 super property 로 register → 이후 모든 event
   *      (log_recorded, message_sent 등) 에 variant 가 자동 첨부돼 breakdown 가능.
   *   2) PostHog experiment 노출 관례인 `$feature_flag_called` 를 flag 값이
   *      바뀐 경우에만 1회 발송 (중복 노출 마킹 방지).
   */
  const reportFlags = useCallback((data: FlagMap) => {
    // (1) super properties: flag map 전체를 그대로 register.
    analytics.register(data);

    // (2) 노출 마킹: 직전 발송값과 다른 flag 만 골라 $feature_flag_called 발송.
    for (const [key, value] of Object.entries(data)) {
      if (lastExposed.current[key] === value) continue;
      analytics.capture('$feature_flag_called', {
        $feature_flag: key,
        $feature_flag_response: value,
      });
      lastExposed.current[key] = value;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setFlags(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    // evaluate_my_flags 는 generated 타입에 없어 캐스팅 우회 (chat-service 패턴).
    const { data, error } = await (
      supabase.rpc as unknown as (
        name: string,
      ) => Promise<{ data: FlagMap | null; error: { message?: string } | null }>
    )('evaluate_my_flags');

    if (error) {
      logger.captureException(error, { tags: { feature: 'feature-flags' } });
      setFlags(null);
      setIsLoading(false);
      return;
    }
    setFlags(data ?? null);
    setIsLoading(false);
    // flags 가 있을 때만 variant 전달/노출 마킹. null(로그아웃/실패)이면 건너뜀.
    if (data) reportFlags(data);
  }, [user, reportFlags]);

  // 로그인/로그아웃 시 로드.
  useEffect(() => {
    if (isAuthLoading) return;
    void refresh();
  }, [isAuthLoading, refresh]);

  // 포그라운드 복귀 시 재평가 (시간경과 조건 갱신).
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ flags, isLoading, refresh }),
    [flags, isLoading, refresh],
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  }
  return ctx;
}

/** 단일 flag 편의 훅. 로드 전/실패 시 fallback 반환. */
export function useFeatureFlag(key: FlagKey, fallback: FlagValue): FlagValue {
  const { flags } = useFeatureFlags();
  return getFlag(flags, key, fallback);
}

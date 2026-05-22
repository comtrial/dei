import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { logger } from '@dei/shared';

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
  }, [user]);

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

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { analytics, logger } from '@dei/shared';

import { configureRevenueCat, logOutRevenueCat } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  ensureAnonymousSession: () => Promise<Session>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isInvalidRefreshTokenError(error: unknown) {
  return error instanceof Error && error.message.includes('Invalid Refresh Token');
}

async function clearLocalAuthSession() {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (error) {
          if (!isInvalidRefreshTokenError(error)) {
            logger.captureException(error, {
              tags: { feature: 'auth', action: 'get-session' },
            });
          }
          await clearLocalAuthSession();
          setSession(null);
          return;
        }

        setSession(data.session);
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (!isInvalidRefreshTokenError(error)) {
          logger.captureException(error, {
            tags: { feature: 'auth', action: 'get-session' },
          });
        }
        await clearLocalAuthSession();
        setSession(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      return;
    }

    configureRevenueCat(userId).catch(() => undefined);
  }, [session?.user.id]);

  const ensureAnonymousSession = useCallback(async () => {
    if (session) {
      return session;
    }

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error('본인확인을 시작할 임시 세션을 만들 수 없어요.');
    }

    setSession(data.session);
    return data.session;
  }, [session]);

  const signOut = useCallback(async () => {
    await logOutRevenueCat();

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    // 로그아웃 → analytics 사용자 컨텍스트 초기화 (이후 이벤트가 익명으로 귀속).
    analytics.reset();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ensureAnonymousSession,
      isLoading,
      session,
      user: session?.user ?? null,
      signOut,
    }),
    [
      ensureAnonymousSession,
      isLoading,
      session,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

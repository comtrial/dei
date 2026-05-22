import { logger } from '@dei/shared';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        setIsLoading(false);
      })
      .catch(async (error) => {
        // Refresh token 손상 등으로 getSession 이 reject 되는 경우 isLoading 이 풀리지 않아
        // RootGate 가 무한 대기 → 화면이 splash 에서 멈춘다. 로컬 세션을 정리하고 unauthenticated 로 진행.
        logger.captureException(error, {
          tags: { feature: 'auth-get-session-init' },
        });

        try {
          await supabase.auth.signOut();
        } catch {
          /* signOut 자체도 실패할 수 있으나 그래도 unauthenticated 로 떨어뜨려야 한다. */
        }

        if (!mounted) {
          return;
        }

        setSession(null);
        setIsLoading(false);
      });

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

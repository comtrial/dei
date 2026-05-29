import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { analytics, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

/**
 * 인증 골격 (spec §3.3 · A-4)
 * ------------------------------------------------------------------
 * Supabase Auth 익명 세션으로 시작 → PortOne 본인인증 통과 시 "검증된 신원"
 * 으로 승격한다(S03). 승격(CI 검증·auth_verification 기록)은 B 담당이며,
 * 여기서는 `promoteWithIdentity` 경계만 placeholder 로 둔다(D-12).
 *
 * 세션이 잡히면 `logger.setUser({ id })` 로 Sentry 사용자 컨텍스트를 연결한다
 * (PII 인 email 은 넣지 않는다 — CLAUDE.md 규칙 4).
 */
type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  /** 익명 세션 보장(없으면 생성). 본인인증 진입 전 임시 세션. */
  ensureAnonymousSession: () => Promise<Session>;
  /** ⚠️ handoff: PortOne 본인인증 결과로 익명→검증 신원 승격 (B 구현 예정). */
  promoteWithIdentity: () => Promise<void>;
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

  // 세션 사용자 ↔ Sentry 컨텍스트 연결(로그아웃 시 해제). email 은 PII 라 제외.
  useEffect(() => {
    const userId = session?.user.id;
    logger.setUser(userId ? { id: userId } : null);
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

  const promoteWithIdentity = useCallback(async () => {
    // handoff: PortOne 본인인증(portone.stub.startIdentityVerification) → 서버
    // 콜백 검증 → auth_verification 기록 → 동일 계정에 본인인증 메타 반영.
    // B 담당. 익명 사용자를 영구 계정으로 승격하는 경로도 여기서 잇는다.
    throw new Error('handoff: PortOne 본인인증 승격(B) 구현 예정');
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    // 로그아웃 → analytics·logger 사용자 컨텍스트 초기화.
    analytics.reset();
    logger.setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ensureAnonymousSession,
      promoteWithIdentity,
      isLoading,
      session,
      user: session?.user ?? null,
      signOut,
    }),
    [ensureAnonymousSession, promoteWithIdentity, isLoading, session, signOut],
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

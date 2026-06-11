import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { analytics, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import type { ConfirmIdentityVerificationResponse } from '@/lib/portone.stub';
import { resetPurchasesUser, syncPurchasesUser } from '@/lib/purchases';
import { clearCachedProfileSnapshot } from '@/lib/profile-session-cache';

/**
 * 인증 골격 (spec §3.3 · A-4)
 * ------------------------------------------------------------------
 * Supabase Auth 익명 세션으로 시작 → PortOne 본인인증 통과 시 "검증된 신원"
 * 으로 승격한다(S03). `promoteWithIdentity` 는 신규 가입 사용자의 검증 세션
 * 유지와 CI 중복 기존 계정 자동 로그인 세션 전환을 모두 처리한다.
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
  /** PortOne 본인인증 결과로 익명 세션을 검증된 앱 사용자 상태로 확정. */
  promoteWithIdentity: (identity: ConfirmIdentityVerificationResponse) => Promise<void>;
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
    if (userId) {
      analytics.identify(userId, {
        auth_state: session?.user.is_anonymous === true ? 'anonymous' : 'authenticated',
      });
    }
  }, [session?.user.id, session?.user.is_anonymous]);

  useEffect(() => {
    const userId = session?.user.id;

    void logger.withErrorCapture(
      'purchases.sync-user',
      async () => {
        if (userId) {
          await syncPurchasesUser(userId);
          return;
        }

        await resetPurchasesUser();
      },
      { tags: { feature: 'payment', provider: 'revenuecat', action: 'sync-user' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { feature: 'payment', provider: 'revenuecat', action: 'sync-user-catch' },
      });
    });
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

  const promoteWithIdentity = useCallback(
    async (identity: ConfirmIdentityVerificationResponse) => {
      if (identity.authSession) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: identity.authSession.accessToken,
          refresh_token: identity.authSession.refreshToken,
        });

        if (sessionError) {
          throw sessionError;
        }

        const nextSession = sessionData.session;
        setSession(nextSession);

        const existingUserId = nextSession?.user.id ?? identity.authSession.userId;
        logger.setUser({ id: existingUserId });
        analytics.identify(existingUserId, {
          birth_date: identity.birthDate ?? null,
          birth_year: identity.birthYear,
          existing_member: Boolean(identity.existingMember),
          gender: identity.gender,
          identity_verified: true,
          is_adult: identity.isAdult,
        });
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      const nextSession = data.session ?? session;
      setSession(nextSession);

      const userId = nextSession?.user.id;

      if (userId) {
        logger.setUser({ id: userId });
        analytics.identify(userId, {
          birth_date: identity.birthDate ?? null,
          birth_year: identity.birthYear,
          gender: identity.gender,
          identity_verified: true,
          is_adult: identity.isAdult,
        });
      }
    },
    [session],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    // 로그아웃 → analytics·logger 사용자 컨텍스트 초기화.
    analytics.reset();
    logger.setUser(null);
    clearCachedProfileSnapshot();
    await resetPurchasesUser();
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

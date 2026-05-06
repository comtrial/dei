import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { canUseLocalDevOtp, LOCAL_DEV_OTP, LOCAL_DEV_PASSWORD } from '@/lib/dev-auth';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  exchangeOAuthCodeFromUrl: (url: string) => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const OAUTH_CALLBACK_PATH = 'callback';

const getOAuthRedirectUrl = () => Linking.createURL(OAUTH_CALLBACK_PATH);

const copySearchParams = (target: URLSearchParams, source: URLSearchParams) => {
  source.forEach((value, key) => {
    if (value) {
      target.set(key, value);
    }
  });
};

const appendEncodedParams = (target: URLSearchParams, value: string) => {
  const trimmedValue = value.replace(/^[?#]/, '');

  if (!trimmedValue) {
    return;
  }

  const queryIndex = trimmedValue.indexOf('?');
  const normalizedValue = queryIndex >= 0 ? trimmedValue.slice(queryIndex + 1) : trimmedValue;
  copySearchParams(target, new URLSearchParams(normalizedValue));
};

const getOAuthCallbackParams = (url: string) => {
  const params = new URLSearchParams();

  try {
    const parsedUrl = new URL(url);
    copySearchParams(params, parsedUrl.searchParams);
    appendEncodedParams(params, parsedUrl.hash);
  } catch {
    const queryStart = url.indexOf('?');
    const hashStart = url.indexOf('#');

    if (queryStart >= 0) {
      const queryEnd = hashStart >= 0 && hashStart > queryStart ? hashStart : url.length;
      appendEncodedParams(params, url.slice(queryStart + 1, queryEnd));
    }

    if (hashStart >= 0) {
      appendEncodedParams(params, url.slice(hashStart + 1));
    }
  }

  const parsedUrl = Linking.parse(url);
  for (const [key, value] of Object.entries(parsedUrl.queryParams ?? {})) {
    const resolvedValue = Array.isArray(value) ? value[0] : value;

    if (resolvedValue) {
      params.set(key, String(resolvedValue));
    }
  }

  return params;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingOAuthCallbacks = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
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

  const exchangeOAuthCodeFromUrl = useCallback(async (url: string) => {
    const pendingCallback = pendingOAuthCallbacks.current.get(url);

    if (pendingCallback) {
      return pendingCallback;
    }

    const exchangePromise = (async () => {
      const callbackParams = getOAuthCallbackParams(url);
      const code = callbackParams.get('code');
      const accessToken = callbackParams.get('access_token');
      const refreshToken = callbackParams.get('refresh_token');
      const oauthError = callbackParams.get('error_description') ?? callbackParams.get('error');

      if (oauthError) {
        throw new Error(oauthError);
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          throw error;
        }

        setSession(data.session);
        return;
      }

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          throw error;
        }

        setSession(data.session);
        return;
      }

      throw new Error('카카오 로그인 응답에서 인증 정보를 찾을 수 없어요.');
    })();

    pendingOAuthCallbacks.current.set(url, exchangePromise);

    try {
      await exchangePromise;
    } catch (error) {
      pendingOAuthCallbacks.current.delete(url);
      throw error;
    }
  }, []);

  const signInWithKakao = useCallback(async () => {
    const redirectTo = getOAuthRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        queryParams: {
          scope: 'profile_nickname profile_image',
        },
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    if (!data.url) {
      throw new Error('카카오 로그인 URL을 만들 수 없어요.');
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('카카오 로그인이 취소되었어요.');
    }

    if (result.type !== 'success') {
      throw new Error('카카오 로그인 결과를 확인할 수 없어요.');
    }

    await exchangeOAuthCodeFromUrl(result.url);
  }, [exchangeOAuthCodeFromUrl]);

  const signInWithEmailOtp = useCallback(async (email: string) => {
    if (canUseLocalDevOtp(email)) {
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw error;
    }
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    if (canUseLocalDevOtp(email) && token.trim() === LOCAL_DEV_OTP) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: LOCAL_DEV_PASSWORD,
      });

      if (error) {
        throw new Error('개발용 123456 로그인에 실패했어요. 로컬 DB seed 상태를 확인해 주세요.');
      }

      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email',
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      exchangeOAuthCodeFromUrl,
      isLoading,
      session,
      signInWithKakao,
      user: session?.user ?? null,
      signInWithEmailOtp,
      verifyEmailOtp,
      signOut,
    }),
    [
      exchangeOAuthCodeFromUrl,
      isLoading,
      session,
      signInWithEmailOtp,
      signInWithKakao,
      signOut,
      verifyEmailOtp,
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

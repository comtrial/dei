import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const liveUrl = Linking.useURL();
  const { exchangeOAuthCodeFromUrl, session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(true);
  const processedUrl = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (liveUrl) {
      setInitialUrl(liveUrl);
      setIsResolvingUrl(false);
      return;
    }

    Linking.getInitialURL()
      .then((url) => {
        if (mounted) {
          setInitialUrl(url);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsResolvingUrl(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [liveUrl]);

  const fallbackCallbackUrl = useMemo(() => {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      const resolvedValue = Array.isArray(value) ? value[0] : value;

      if (resolvedValue) {
        query.set(key, resolvedValue);
      }
    }

    const queryString = query.toString();
    return `dei://callback${queryString ? `?${queryString}` : ''}`;
  }, [params]);

  const callbackUrl = useMemo(() => {
    if (initialUrl?.includes('callback')) {
      return initialUrl;
    }

    return fallbackCallbackUrl;
  }, [fallbackCallbackUrl, initialUrl]);

  const hasCallbackPayload = callbackUrl.includes('?') || callbackUrl.includes('#');

  useEffect(() => {
    if (session) {
      router.replace(ROUTES.terms as never);
    }
  }, [router, session]);

  useEffect(() => {
    if (session || isResolvingUrl) {
      return;
    }

    if (!hasCallbackPayload) {
      const timeout = setTimeout(() => {
        setError('카카오 로그인 응답에서 인증 정보를 찾을 수 없어요.');
      }, 2000);

      return () => clearTimeout(timeout);
    }

    if (processedUrl.current === callbackUrl) {
      return;
    }

    processedUrl.current = callbackUrl;

    exchangeOAuthCodeFromUrl(callbackUrl)
      .then(() => router.replace(ROUTES.terms as never))
      .catch((callbackError) => {
        setError(
          callbackError instanceof Error
            ? callbackError.message
            : '로그인 응답을 처리할 수 없어요.',
        );
      });
  }, [
    callbackUrl,
    exchangeOAuthCodeFromUrl,
    hasCallbackPayload,
    isResolvingUrl,
    router,
    session,
  ]);

  return (
    <Screen
      eyebrow="AUTH"
      title="로그인 처리 중"
      description="카카오 로그인 결과를 확인하고 있어요.">
      <View className="gap-5">
        {error ? (
          <>
            <Text className="text-destructive text-sm">{error}</Text>
            <Button onPress={() => router.replace(ROUTES.signIn as never)} variant="outline">
              <Text>다시 로그인하기</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    </Screen>
  );
}

import '../global.css';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { analytics } from '@dei/shared';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountGateProvider } from '@/providers/account-gate-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { FeatureFlagsProvider } from '@/providers/feature-flags-provider';
import { RootGate } from '@/providers/root-gate';
import {
  addPushResponseListener,
  clearLastPushResponse,
  configureForegroundPushNotifications,
  getLastPushResponse,
  getPushRouteFromResponse,
} from '@/lib/push-notifications';
import { NAV_THEME } from '@/lib/theme';
import { Sentry, initSentry } from '@/lib/sentry';
import { initPostHog } from '@/lib/posthog';

initSentry();
void configureForegroundPushNotifications();
initPostHog();

export const unstable_settings = {
  anchor: '(auth)',
};

function PushNotificationNavigator() {
  const router = useRouter();

  useEffect(() => {
    const routeFromResponse = (response: NonNullable<ReturnType<typeof getLastPushResponse>>) => {
      const route = getPushRouteFromResponse(response);

      if (route) {
        router.push(route as never);
      }

      clearLastPushResponse();
    };

    const lastResponse = getLastPushResponse();

    if (lastResponse) {
      routeFromResponse(lastResponse);
    }

    const subscription = addPushResponseListener(routeFromResponse);
    return () => subscription.remove();
  }, [router]);

  return null;
}

/**
 * 앱 진입(cold start)을 1회만 기록한다. 세션 로딩이 끝난 뒤 토큰 보유 여부를
 * 함께 보내기 위해 AuthProvider 내부에서 useAuth 로 session 을 읽는다.
 */
function AppOpenedTracker() {
  const { isLoading, session } = useAuth();
  const hasFired = useRef(false);

  useEffect(() => {
    if (isLoading || hasFired.current) {
      return;
    }

    hasFired.current = true;
    analytics.capture('app_opened', {
      has_token: Boolean(session),
      source: 'cold_start',
      app_version: Constants.expoConfig?.version ?? 'unknown',
    });
  }, [isLoading, session]);

  return null;
}

function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <AuthProvider>
      <AppOpenedTracker />
      <AccountGateProvider>
        <FeatureFlagsProvider>
          <ThemeProvider value={NAV_THEME[themeName]}>
            <PushNotificationNavigator />
            <RootGate>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
                <Stack.Screen name="result" options={{ headerShown: false }} />
                <Stack.Screen name="log-detail" options={{ headerShown: false }} />
                <Stack.Screen name="log-detail/delete-confirm" options={{ headerShown: false, presentation: 'transparentModal' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: '신고' }} />
              </Stack>
            </RootGate>
            <StatusBar style="auto" />
            <PortalHost />
          </ThemeProvider>
        </FeatureFlagsProvider>
      </AccountGateProvider>
    </AuthProvider>
  );
}

export default Sentry.wrap(RootLayout);

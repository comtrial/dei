import '../global.css';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountGateProvider } from '@/providers/account-gate-provider';
import { AuthProvider } from '@/providers/auth-provider';
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

initSentry();
void configureForegroundPushNotifications();

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

function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <AuthProvider>
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

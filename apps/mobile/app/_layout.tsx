import '../global.css';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountGateProvider } from '@/providers/account-gate-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { FeatureFlagsProvider } from '@/providers/feature-flags-provider';
import { RootGate } from '@/providers/root-gate';
import { configureForegroundPushNotifications } from '@/lib/push-notifications';
import { NAV_THEME } from '@/lib/theme';
import { Sentry, initSentry } from '@/lib/sentry';

initSentry();
void configureForegroundPushNotifications();

export const unstable_settings = {
  anchor: '(auth)',
};

function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <AuthProvider>
      <AccountGateProvider>
        <FeatureFlagsProvider>
          <ThemeProvider value={NAV_THEME[themeName]}>
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

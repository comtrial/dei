import '../global.css';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountGateProvider } from '@/providers/account-gate-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { RootGate } from '@/providers/root-gate';
import { NAV_THEME } from '@/lib/theme';

export const unstable_settings = {
  anchor: '(auth)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <AuthProvider>
      <AccountGateProvider>
        <ThemeProvider value={NAV_THEME[themeName]}>
          <RootGate>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: '신고' }} />
            </Stack>
          </RootGate>
          <StatusBar style="auto" />
          <PortalHost />
        </ThemeProvider>
      </AccountGateProvider>
    </AuthProvider>
  );
}

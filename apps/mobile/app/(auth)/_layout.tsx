import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="terms-detail" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="account-status" />
    </Stack>
  );
}

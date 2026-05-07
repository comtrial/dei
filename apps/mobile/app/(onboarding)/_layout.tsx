import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="profile" />
      <Stack.Screen name="log-intro" />
      <Stack.Screen name="video-review" />
    </Stack>
  );
}

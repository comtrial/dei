import { Stack } from 'expo-router';

export default function RoomLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="upload"
        options={{
          orientation: 'landscape',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="upload-preview"
        options={{ orientation: 'portrait' }}
      />
    </Stack>
  );
}

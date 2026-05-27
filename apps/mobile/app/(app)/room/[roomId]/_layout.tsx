/**
 * room/[roomId] nested layout — Stack 기반.
 *
 * 방 화면은 탭 없이 스택 네비게이션.
 * 각 화면은 header 없음 (각 화면이 자체 헤더 구성).
 */
import { Stack } from 'expo-router';

export default function RoomLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="members" />
      <Stack.Screen name="upload" />
      <Stack.Screen name="leave-confirm" />
    </Stack>
  );
}

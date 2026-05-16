/**
 * Playwright web harness app.
 *
 * Mounts the *real* chat screens / components against react-native-web so a
 * real browser exercises the production UI code (the load-bearing logic the
 * chat spec cares about) at the DOM level. expo-router / auth-provider are
 * shimmed (see e2e/playwright/vite.config.ts aliases) and the Supabase data
 * layer is replaced by mockChatService — keeping the run hermetic (no Docker).
 *
 * Route is chosen via `?screen=` query param; scenario via `?scenario=`.
 */
import { useMemo } from 'react';
import { View } from 'react-native';

import MessagesScreen from '@/app/(app)/messages';
import ChatRoomScreen from '@/app/(app)/chat-room';
import ChatRouteGate from '@/app/(app)/chat';
import { __setHarnessRouteParams } from '@/__harness_shims__/expo-router';

type ScreenName = 'messages' | 'chat-room' | 'chat';

function readQuery() {
  const p = new URLSearchParams(window.location.search);
  return {
    screen: (p.get('screen') as ScreenName) ?? 'messages',
    scenario: p.get('scenario') ?? 'list-populated',
  };
}

export default function HarnessApp() {
  const { screen, scenario } = useMemo(readQuery, []);

  // Drive the mock data layer + the shimmed router params.
  (globalThis as { __CHAT_SCENARIO__?: string }).__CHAT_SCENARIO__ = scenario;
  __setHarnessRouteParams({
    conversationId: 'conv-fixture-1',
    otherUserId: 'other-user-id',
    otherNickname: '하늘',
    source: 'list',
  });

  // Explicit pixel height: RN-web resolves `flex:1` chains only when an
  // ancestor has a concrete height. The browser viewport is 100vh; mirror it
  // so the chat-room's SafeAreaView/KeyboardAvoidingView don't collapse to 0.
  return (
    <View
      style={{ height: '100vh' as unknown as number, width: '100%', maxWidth: 480, alignSelf: 'center' }}
      testID="harness-root">
      {screen === 'chat-room' ? (
        <ChatRoomScreen />
      ) : screen === 'chat' ? (
        <ChatRouteGate />
      ) : (
        <MessagesScreen />
      )}
    </View>
  );
}

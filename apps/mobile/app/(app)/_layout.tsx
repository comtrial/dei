import { Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/navigation/bottom-tab-bar';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="matches" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="discovery" options={{ href: null }} />
      <Tabs.Screen name="my-profile" options={{ href: null }} />
      <Tabs.Screen name="profiles/[userId]" options={{ href: null }} />
      <Tabs.Screen name="likes/received/[id]" options={{ href: null }} />
      <Tabs.Screen name="likes/sent/[id]" options={{ href: null }} />
      <Tabs.Screen name="matched/[matchId]" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="chat-room" options={{ href: null }} />
    </Tabs>
  );
}

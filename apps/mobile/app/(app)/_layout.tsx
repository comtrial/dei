import { Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/navigation/bottom-tab-bar';
import { usePushTokenRegistration } from '@/hooks/usePushTokenRegistration';
import { useAuth } from '@/providers/auth-provider';

export default function AppLayout() {
  const { user } = useAuth();

  usePushTokenRegistration(user?.id);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}>
      {/* 탭 렌더는 BottomTabBar 가 담당(아이콘/라벨/강조버튼/배지). 여기선 라우트 등록만. */}
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="likes" options={{ title: '좋아요' }} />
      <Tabs.Screen name="matches" options={{ href: null }} />
      <Tabs.Screen name="record" options={{ title: 'My dei' }} />
      <Tabs.Screen name="messages" options={{ title: 'DM' }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="discovery" options={{ href: null }} />
      <Tabs.Screen name="my-profile" options={{ href: null }} />
      <Tabs.Screen name="profiles/[userId]" options={{ href: null }} />
      <Tabs.Screen name="likes/received/[id]" options={{ href: null }} />
      <Tabs.Screen name="likes/sent/[id]" options={{ href: null }} />
      <Tabs.Screen name="matched/[matchId]" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen
        name="chat-room"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}

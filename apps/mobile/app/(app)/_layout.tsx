import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#171310',
        tabBarInactiveTintColor: '#A89880',
        tabBarStyle: {
          backgroundColor: '#F5EDDB',
          borderTopColor: '#E0D5C0',
          borderTopWidth: 1,
        },
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'REC',
          tabBarIcon: ({ color, size }) => <Ionicons name="camera-outline" color={color} size={size} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'DM',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="discovery" options={{ href: null }} />
    </Tabs>
  );
}

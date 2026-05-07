import { Camera, Heart, Home, MessageCircle } from 'lucide-react-native';
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
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <Heart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'REC',
          tabBarIcon: ({ color, size }) => <Camera color={color} size={size} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'DM',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="discovery" options={{ href: null }} />
    </Tabs>
  );
}

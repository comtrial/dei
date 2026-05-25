import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { House, Video, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// 탭바 자체를 숨기는 전체화면 라우트
// (Phase 1 정리: chat-room 제거. Phase 3 에서 방 단위 화면이 들어오면 그때 다시 추가)
const HIDDEN_ROUTES = new Set(['record']);

type NavItem = {
  name: string;
  label: string;
  icon: LucideIcon;
};

// 좌측 일반 탭
// (Phase 1 정리: 옛 도메인 탭 likes/messages 제거. Phase 3 에서 새 탭 추가 예정)
const ITEMS: NavItem[] = [
  { name: 'home', label: '홈', icon: House },
];

// 우측 강조 버튼 (녹화 → "My dei")
const RECORD_ITEM: NavItem = { name: 'record', label: 'My dei', icon: Video };

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const focusedName = state.routes[state.index]?.name;
  if (focusedName && HIDDEN_ROUTES.has(focusedName)) return null;

  const routeByName = new Map(state.routes.map((route) => [route.name, route]));

  const navigateTo = (name: string) => {
    const route = routeByName.get(name);
    if (!route) return;

    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (focusedName !== name && !event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  return (
    <View
      className="flex-row items-end border-t border-border bg-background px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
      {ITEMS.map((item) => {
        const focused = focusedName === item.name;
        return (
          <Pressable
            key={item.name}
            testID={`tab-${item.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            onPress={() => navigateTo(item.name)}
            className="flex-1 items-center gap-1 py-1">
            <Icon
              as={item.icon}
              size={24}
              className={focused ? 'text-foreground' : 'text-muted-foreground'}
            />
            <Text
              className={cn(
                'text-xs',
                focused ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        testID="tab-record"
        accessibilityRole="button"
        accessibilityLabel={RECORD_ITEM.label}
        onPress={() => navigateTo(RECORD_ITEM.name)}
        className="flex-1 items-center gap-1">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30">
          <Icon as={RECORD_ITEM.icon} size={26} className="text-primary-foreground" />
        </View>
        <Text className="text-xs font-semibold text-foreground">{RECORD_ITEM.label}</Text>
      </Pressable>
    </View>
  );
}

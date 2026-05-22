import { useRouter } from 'expo-router';
import { Heart, UserCircle } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';

type HomeTopBarProps = {
  heartCount?: number;
};

export function HomeTopBar({ heartCount }: HomeTopBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="flex-row items-center justify-between bg-[#F5EDDB] px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
      <View className="flex-row items-center gap-2">
        {typeof heartCount === 'number' ? (
          <View className="h-8 flex-row items-center gap-1.5 rounded-md border border-[#E0D5C0] bg-[#FFF8EA] px-2.5">
            <Heart size={15} color="#C0432A" fill="#C0432A" />
            <Text className="text-xs font-bold text-[#171310]">{heartCount}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityLabel="내 프로필"
          hitSlop={12}
          onPress={() => router.push(ROUTES.myProfile as never)}
        >
          <View className="h-7 w-7 items-center justify-center">
            <UserCircle size={21} color="#171310" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

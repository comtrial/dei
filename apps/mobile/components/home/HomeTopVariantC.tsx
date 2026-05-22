import { useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';

type Props = {
  /** 최근 영상 며칠 전. */
  daysSinceVideo?: number | null;
  onRecordNew?: () => void;
  onLater?: () => void;
};

/**
 * 홈 상단 variant C — "리프레시 유도형 (압박 레버)".
 * 영상이 오래되면 매칭 풀에서 멀어진다는 압박으로 새 영상 촬영 유도.
 */
export function HomeTopVariantC({ daysSinceVideo, onRecordNew, onLater }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View className="bg-[#F5EDDB] px-4 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
        <TouchableOpacity
          accessibilityLabel="내 프로필"
          hitSlop={12}
          onPress={() => router.push(ROUTES.myProfile as never)}>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-[#D9C9A8]" />
        </TouchableOpacity>
      </View>

      <View className="rounded-2xl bg-[#EFE6D2] p-3" testID="home-top-variant-c">
        <View className="flex-row items-center gap-3">
          <View className="relative h-14 w-14 items-center justify-center rounded-xl bg-[#C8C2B6]">
            {typeof daysSinceVideo === 'number' ? (
              <View className="rounded-md bg-black/70 px-1.5 py-0.5">
                <Text className="text-[10px] font-bold text-white">{daysSinceVideo}일 전</Text>
              </View>
            ) : null}
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-[#171310]">요즘 모습 보여주세요</Text>
            <Text className="text-xs leading-4 text-[#7A6F5C]">
              영상이 오래되면 매칭 풀에서 점점 멀어져요.
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row gap-2">
          <TouchableOpacity
            className="flex-row items-center gap-1.5 rounded-xl bg-[#171310] px-4 py-2.5"
            onPress={onRecordNew}
            testID="home-top-c-record">
            <View className="h-1.5 w-1.5 rounded-full bg-[#C0432A]" />
            <Text className="text-sm font-semibold text-white">새로 찍기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-xl border border-[#D9C9A8] px-4 py-2.5"
            onPress={onLater}
            testID="home-top-c-later">
            <Text className="text-sm font-semibold text-[#171310]">나중에</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

import { useRouter } from 'expo-router';
import { Image, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartBalancePill, RefreshTicketBalancePill } from '@/components/home/HeartBalancePill';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';

type StatItem = { label: string; value: number; delta?: number };

type Props = {
  heartCount?: number;
  refreshItemCount?: number;
  /** 최근 영상 며칠 전 (없으면 배너 생략). */
  daysSinceVideo?: number | null;
  stats?: StatItem[];
  /** 내 프로필 사진 (signed URL). 없으면 회색 fallback. */
  myPhotoUrl?: string | null;
  /** 내 최근 영상 썸네일 (signed URL). 없으면 회색 fallback. */
  myLatestVideoThumbUrl?: string | null;
  onSeeResults?: () => void;
  onRecordMore?: () => void;
};

/**
 * 홈 상단 variant B — "모멘텀 강화형 (보상 레버)".
 * 최근 영상의 반응 통계(조회/좋아요/매칭)를 보여주고 "한 편 더 찍기" 유도.
 * 데이터가 없으면 통계는 0 으로 표기.
 */
export function HomeTopVariantB({
  heartCount,
  refreshItemCount,
  daysSinceVideo,
  stats,
  myPhotoUrl,
  myLatestVideoThumbUrl,
  onSeeResults,
  onRecordMore,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const items: StatItem[] = stats ?? [
    { label: '조회', value: 0 },
    { label: '좋아요', value: 0 },
    { label: '매칭', value: 0 },
  ];

  return (
    <View className="bg-[#F5EDDB] px-4 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
        <View className="flex-row items-center gap-2">
          <HeartBalancePill heartCount={heartCount} />
          <RefreshTicketBalancePill refreshItemCount={refreshItemCount} />
          <TouchableOpacity
            accessibilityLabel="내 프로필"
            hitSlop={12}
            onPress={() => router.push(ROUTES.myProfile as never)}>
            {myPhotoUrl ? (
              <Image
                accessibilityLabel="내 프로필 사진"
                className="h-7 w-7 rounded-full bg-[#D9C9A8]"
                source={{ uri: myPhotoUrl }}
              />
            ) : (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-[#D9C9A8]" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View className="rounded-2xl bg-[#EFE6D2] p-3" testID="home-top-variant-b">
        <View className="flex-row items-center gap-3">
          {myLatestVideoThumbUrl ? (
            <Image
              accessibilityLabel="내 최근 영상 썸네일"
              className="h-14 w-24 rounded-xl bg-[#D9C9A8]"
              resizeMode="cover"
              source={{ uri: myLatestVideoThumbUrl }}
            />
          ) : (
            <View className="h-14 w-24 rounded-xl bg-[#D9C9A8]" />
          )}
          <View className="flex-1">
            <Text className="text-base font-bold text-[#171310]">반응이 오고 있어요</Text>
            <Text className="text-xs text-[#7A6F5C]">
              {typeof daysSinceVideo === 'number' ? `최근 영상 · ${daysSinceVideo}일 전` : '최근 영상'}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row">
          {items.map((s) => (
            <View className="flex-1" key={s.label}>
              <Text className="text-[11px] text-[#7A6F5C]">{s.label}</Text>
              <View className="flex-row items-end gap-1">
                <Text className="text-lg font-bold text-[#171310]">{s.value}</Text>
                {typeof s.delta === 'number' && s.delta !== 0 ? (
                  <Text className="pb-0.5 text-[11px] font-semibold text-[#2E7D32]">
                    ↑+{s.delta}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <View className="mt-3 flex-row gap-2">
          <TouchableOpacity
            className="flex-1 items-center rounded-xl border border-[#D9C9A8] py-2.5"
            onPress={onSeeResults}
            testID="home-top-b-results">
            <Text className="text-sm font-semibold text-[#171310]">결과 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 items-center rounded-xl bg-[#171310] py-2.5"
            onPress={onRecordMore}
            testID="home-top-b-record">
            <Text className="text-sm font-semibold text-white">한 편 더 찍기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

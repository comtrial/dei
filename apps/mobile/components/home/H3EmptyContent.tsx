import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function H3EmptyContent() {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      {/* 달 일러스트 (이모지 대체) */}
      <View className="h-28 w-28 items-center justify-center rounded-full bg-[#EDE4D0]">
        <Text style={{ fontSize: 56 }}>🌙</Text>
      </View>

      {/* 안내 문구 */}
      <View className="items-center gap-1.5">
        <Text className="text-center text-base font-bold leading-6 text-[#171310]">
          오늘은 어울리는 친구를{'\n'}찾기 어려워요.
        </Text>
        <Text className="text-center text-sm text-[#6E6354]">내일 다시 만나요</Text>
      </View>

      {/* 정오 갱신 칩 */}
      <View className="rounded-full bg-[#EDE4D0] px-3 py-1">
        <Text className="font-mono text-[11px] text-[#6E6354]">정오에 자동 갱신</Text>
      </View>
    </View>
  );
}

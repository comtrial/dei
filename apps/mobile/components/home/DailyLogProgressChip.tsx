import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { DailyLogProgress } from '@/lib/dailyLog';

interface Props {
  logProgress: DailyLogProgress;
}

export function DailyLogProgressChip({ logProgress }: Props) {
  const { total } = logProgress;

  return (
    <View className="flex-row items-center gap-1 self-center rounded-xl bg-black/55 px-3 py-1">
      <Text className="text-[10px] text-white/80">
        {total === 0 ? '오늘 기록 없음' : `오늘 ${total}회 기록`}
      </Text>
    </View>
  );
}

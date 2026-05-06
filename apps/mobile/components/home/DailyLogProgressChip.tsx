import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ALL_SLOTS, type DailyLogProgress, type TimeSlot } from '@/lib/dailyLog';

interface Props {
  logProgress: DailyLogProgress;
}

export function DailyLogProgressChip({ logProgress }: Props) {
  const { completedSlots, total, isComplete } = logProgress;

  return (
    <View
      className={cn(
        'flex-row items-center gap-1 self-center rounded-xl px-3 py-1',
        isComplete ? 'bg-green-900/75' : 'bg-black/55'
      )}
    >
      {ALL_SLOTS.map((slot: TimeSlot) => (
        <View
          key={slot}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            completedSlots.includes(slot) ? 'bg-[#C0432A]' : 'bg-white/25'
          )}
        />
      ))}
      <Text
        className={cn(
          'text-[10px] ml-1',
          isComplete ? 'text-green-200/90' : 'text-white/80'
        )}
      >
        {isComplete ? '오늘의 로그 완성' : `${total}/3 완성 중`}
      </Text>
    </View>
  );
}

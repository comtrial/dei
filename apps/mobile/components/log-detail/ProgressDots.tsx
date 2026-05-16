import { View } from 'react-native';

import { cn } from '@/lib/utils';

interface Props {
  total: number;
  current: number;
}

export function ProgressDots({ total, current }: Props) {
  if (total <= 1) return null;
  return (
    <View className="flex-row gap-1 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className={cn(
            'h-1 rounded-full',
            i === current ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
          )}
        />
      ))}
    </View>
  );
}

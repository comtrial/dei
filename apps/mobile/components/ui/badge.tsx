import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type BadgeProps = {
  count?: number;
  label?: string;
  className?: string;
  testID?: string;
};

export function Badge({ count, label, className, testID }: BadgeProps) {
  const text = label ?? (count != null && count > 0 ? (count > 99 ? '99+' : String(count)) : '');

  if (!text) return null;

  return (
    <View
      className={cn(
        'min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary px-1.5',
        className
      )}
      testID={testID}
    >
      <Text className="text-[10px] font-bold text-primary-foreground">{text}</Text>
    </View>
  );
}

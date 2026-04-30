import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type StatusRowProps = {
  detail?: string;
  label: string;
  tone?: 'default' | 'success' | 'warning';
  value: string;
};

export function StatusRow({ detail, label, tone = 'default', value }: StatusRowProps) {
  return (
    <View className="border-border flex-row items-center justify-between gap-4 border-b py-4">
      <View className="min-w-0 flex-1">
        <Text className="font-medium">{label}</Text>
        {detail ? <Text className="text-muted-foreground mt-1 text-sm">{detail}</Text> : null}
      </View>
      <Text
        className={cn(
          'rounded-md px-2 py-1 text-xs font-semibold',
          tone === 'default' && 'bg-muted text-muted-foreground',
          tone === 'success' && 'bg-secondary text-accent',
          tone === 'warning' && 'bg-muted text-accent',
        )}>
        {value}
      </Text>
    </View>
  );
}

import { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ScreenProps = {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title: string;
};

export function Screen({ children, className, description, eyebrow, title }: ScreenProps) {
  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        bounces={false}
        contentContainerClassName={cn('flex-grow px-4 pb-8 pt-10', className)}
        keyboardShouldPersistTaps="handled">
        <View className="mb-7 gap-3">
          {eyebrow ? (
            <Text className="text-accent text-xs font-semibold uppercase tracking-[2.4px]">
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="h1">{title}</Text>
          {description ? (
            <Text className="text-muted-foreground text-base leading-6">{description}</Text>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, PulseRing, Text } from '@dei/ui';

type MatchingWaitingViewProps = {
  action?: {
    label: string;
    onPress: () => void;
  };
  cardLabel: string;
  cardValue: string;
  description: string;
  testID?: string;
  title: string;
  toast?: string | null;
};

export function MatchingWaitingView({
  action,
  cardLabel,
  cardValue,
  description,
  testID,
  title,
  toast,
}: MatchingWaitingViewProps) {
  return (
    <SafeAreaView testID={testID} className="flex-1 bg-bg">
      <View className="flex-1 px-[24px] pb-[36px] pt-[64px]">
        <View className="items-center">
          <PulseRing
            className="mb-[32px]"
            core={<Text className="text-[24px] font-black text-white">dei</Text>}
          />
          <Text variant="h1" className="text-center text-[25px] leading-[33px]">
            {title}
          </Text>
          <Text className="mt-[10px] text-center text-[15.5px] leading-[21px] text-ink-3">
            {description}
          </Text>
        </View>

        <Card className="mt-[34px] items-center rounded-md border-0 bg-bg-2 px-[22px] py-[14px]">
          <Text className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            {cardLabel}
          </Text>
          <Text className="mt-[4px] text-[19px] font-extrabold text-ink">
            {cardValue}
          </Text>
        </Card>

        {action ? (
          <Button
            variant="secondary"
            className="mt-auto self-end rounded-full border border-line bg-paper px-[20px] py-[12px]"
            textClassName="text-[15px] font-bold"
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        ) : null}
      </View>

      {toast ? (
        <View className="absolute bottom-[34px] left-0 right-0 items-center px-[24px]">
          <View className="rounded-full bg-ink px-[16px] py-[10px]">
            <Text className="text-center text-[14.5px] font-bold text-white">
              {toast}
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

MatchingWaitingView.displayName = 'MatchingWaitingView';

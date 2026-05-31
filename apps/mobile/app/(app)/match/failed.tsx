import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, IconButton, Text } from '@dei/ui';

import { ROUTES } from '@/lib/routes';

const EXPIRE_REASONS = [
  '같은 시간대에 매칭 가능한 사람이 적었어요',
  '활동 지역이 멀어서 매칭이 어려웠어요',
  '큐 지속 시간은 최대 24시간이에요',
] as const;

export default function MatchFailedScreen() {
  const router = useRouter();
  const goHome = () => router.replace(ROUTES.home);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-end px-[18px] pt-[14px]">
        <IconButton glyph={X} accessibilityLabel="닫기" onPress={goHome} />
      </View>

      <View className="flex-1 px-[24px] pb-[32px] pt-[42px]">
        <View className="items-center">
          <Text className="text-[34px] leading-[40px]">🕊</Text>
          <Text variant="h1" className="mt-[16px] text-center text-[25px] leading-[33px]">
            매칭 상대를{'\n'}찾지 못했어요
          </Text>
          <Text className="mt-[10px] text-center text-[13.5px] leading-[21px] text-ink-3">
            큐가 24시간 만료됐어요.{'\n'}다시 시작하면 새로운 인연을 찾아드려요.
          </Text>
        </View>

        <Card className="mt-[28px] border-0 bg-bg-2 px-[16px] py-[14px]">
          <Text className="text-[12.5px] font-bold leading-[20px] text-ink">
            왜 만료됐나요?
          </Text>
          <View className="mt-[6px] gap-[4px]">
            {EXPIRE_REASONS.map((reason) => (
              <Text key={reason} className="text-[12.5px] leading-[20px] text-ink-2">
                • {reason}
              </Text>
            ))}
          </View>
        </Card>

        <View className="mt-auto gap-[10px]">
          <Button
            fullWidth
            variant="accent"
            onPress={() =>
              router.replace({
                pathname: '/(app)/permission/notification',
                params: { memberIds: '' },
              })
            }
          >
            다시 매칭 시작
          </Button>
          <Button fullWidth variant="tertiary" onPress={goHome}>
            나중에 다시 시도
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

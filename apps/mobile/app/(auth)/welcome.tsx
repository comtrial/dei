import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

const ONBOARDING_SCREENS = [
  {
    body: '하루의 3개 순간으로 당신이 드러납니다. 2초씩, 앱 안에서만.',
    eyebrow: 'ONBOARDING · 1 / 3',
    title: '사진 한 장으로\n당신을 설명할 수 없어요',
  },
  {
    body: '앱 내 촬영만. 촬영 간 1시간 간격. 편집도, 보정도 없어요.',
    eyebrow: 'ONBOARDING · 2 / 3',
    title: '하루에 세 번,\n2초씩',
  },
  {
    body: '내가 기록한 만큼만 상대가 열립니다. 조용한 약속.',
    eyebrow: 'ONBOARDING · 3 / 3',
    title: '내 하루만큼,\n타인이 보여요',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [isBooting, setIsBooting] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const page = ONBOARDING_SCREENS[pageIndex];
  const isLastPage = pageIndex === ONBOARDING_SCREENS.length - 1;

  const buttonLabel = useMemo(() => (isLastPage ? '시작하기' : '다음'), [isLastPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBooting(false);
    }, 900);

    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    if (isLastPage) {
      router.push(ROUTES.terms as never);
      return;
    }

    setPageIndex((current) => Math.min(current + 1, ONBOARDING_SCREENS.length - 1));
  };

  if (isBooting) {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <View className="items-center gap-8">
          <View className="items-center gap-3">
            <Text className="text-6xl font-semibold tracking-tight">dei.</Text>
            <Text className="text-muted-foreground text-base">하루가 당신입니다</Text>
          </View>
          <View className="bg-primary h-1 w-11 rounded-full" />
          <Text className="text-muted-foreground text-center text-sm font-semibold uppercase tracking-[5px]">
            Boot · Loading Secure{'\n'}Module
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 justify-end px-8 pb-8">
        <View className="mb-48 gap-5">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[5px]">
            {page.eyebrow}
          </Text>
          <Text className="text-4xl font-semibold leading-tight">{page.title}</Text>
          <Text className="text-muted-foreground text-base leading-6">{page.body}</Text>
        </View>

        <View className="gap-7">
          <View className="flex-row justify-center gap-2">
            {ONBOARDING_SCREENS.map((screen, index) => (
              <Pressable
                accessibilityLabel={`${index + 1}번째 온보딩`}
                accessibilityRole="button"
                className={cn(
                  'bg-muted h-1.5 w-10 rounded-full',
                  index === pageIndex && 'bg-primary',
                )}
                key={screen.eyebrow}
                onPress={() => setPageIndex(index)}
              />
            ))}
          </View>

          <Button onPress={handleNext} size="lg">
            <Text>{buttonLabel}</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

import { Camera, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAccountGate } from '@/providers/account-gate-provider';

const logIntroPages = [
  {
    body: '정해진 알림이 오면 지금의 순간을 짧게 남겨요. 앱 안에서 촬영한 로그만 사용합니다.',
    title: '매 정시 알림이 발송됩니다',
  },
  {
    body: '서로 다른 시각의 로그가 3개 이상 모이면 오늘의 데일리 로그가 완성됩니다.',
    title: '하루 3개 이상 로그를 모아요',
  },
  {
    body: '데일리 로그가 완성되면 다른 사람의 추천에도 등장할 수 있어요.',
    title: '완성된 하루가 추천으로 이어져요',
  },
];

export default function LogIntroScreen() {
  const router = useRouter();
  const { completeLogIntro } = useAccountGate();
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentPage = logIntroPages[pageIndex];
  const isLastPage = pageIndex === logIntroPages.length - 1;

  const handleBack = useCallback(() => {
    if (pageIndex === 0) {
      return false;
    }

    setPageIndex((current) => Math.max(current - 1, 0));
    return true;
  }, [pageIndex]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);

    return () => subscription.remove();
  }, [handleBack]);

  const handleNext = async () => {
    setError(null);

    if (!isLastPage) {
      setPageIndex((current) => Math.min(current + 1, logIntroPages.length - 1));
      return;
    }

    setIsSubmitting(true);

    try {
      await completeLogIntro();
      router.replace(ROUTES.firstVideo as never);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '로그 소개를 완료할 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        bounces={false}
        contentContainerClassName="flex-grow justify-end px-7 pb-8 pt-10"
        showsVerticalScrollIndicator={false}>
        <View className="mb-auto min-h-12 flex-row items-center">
          {pageIndex > 0 ? (
            <Pressable
              accessibilityLabel="이전 페이지"
              accessibilityRole="button"
              className="bg-background border-border h-11 w-11 items-center justify-center rounded-full border"
              disabled={isSubmitting}
              onPress={handleBack}
            >
              <ChevronLeft color="#8F6A2C" size={22} />
            </Pressable>
          ) : null}
        </View>
        <View className="mb-16 gap-5">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[4px]">
            P4 · LOG INTRO · {pageIndex + 1} / 3
          </Text>
          <View className="bg-muted h-28 w-28 items-center justify-center rounded-full">
            <Camera color="#8F6A2C" size={42} />
          </View>
          <Text className="text-foreground text-4xl font-semibold leading-tight">
            {currentPage.title}
          </Text>
          <Text className="text-muted-foreground text-base leading-6">{currentPage.body}</Text>
        </View>

        <View className="gap-7">
          <View className="flex-row justify-center gap-2">
            {logIntroPages.map((page, index) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: index === pageIndex }}
                className={cn('bg-muted h-1.5 w-10 rounded-full', index === pageIndex && 'bg-primary')}
                key={page.title}
                onPress={() => setPageIndex(index)}
              />
            ))}
          </View>
          {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
          <Button disabled={isSubmitting} onPress={handleNext} size="lg">
            {isSubmitting ? (
              <ActivityIndicator color="#F2EADA" />
            ) : (
              <Text>{isLastPage ? '첫 로그 촬영하기' : '다음'}</Text>
            )}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

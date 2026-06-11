import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import { Badge, Button, Card, Text } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { PAYMENT_PACKS } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';

const PAYMENT_ERROR_CODE = 'store_purchase_failed · app_store';

export default function BoosterFailedScreen() {
  const router = useRouter();
  const { code, message } = useLocalSearchParams<{ code?: string; message?: string }>();
  const [copied, setCopied] = useState(false);
  const errorCode = code
    ? `${code}${message && message !== code ? ` · ${message}` : ''} (App Store)`
    : PAYMENT_ERROR_CODE;

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.payment_failure_alert_shown, {
      code: code ?? 'unknown',
    });
  }, [code]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyErrorCode = () => {
    void Clipboard.setStringAsync(errorCode)
      .then(() => setCopied(true))
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'booster-failed', action: 'copy-error-code' },
        });
      });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1">
        <View className="absolute inset-0 px-[24px] pt-[52px] opacity-40">
          <View className="flex-row items-center justify-between">
            <Text className="text-[18px] font-extrabold text-ink">바로 매치</Text>
            <Badge variant="count">잔여 0회</Badge>
          </View>

          <View className="mt-[28px] flex-row gap-[8px]">
            <Card className="flex-1 border-0 bg-bg-2 px-[12px] py-[14px]">
              <Text className="text-[13px] font-bold text-ink-3">그냥 기다리기</Text>
              <Text className="mt-[6px] text-[18px] font-extrabold text-ink">23시간 32분</Text>
              <Text className="mt-[4px] text-[13px] text-ink-3">내일 13:45 가능</Text>
            </Card>
            <Card className="flex-1 border-0 bg-ink px-[12px] py-[14px]">
              <Text className="text-[13px] font-bold text-white/70">바로 매치</Text>
              <Text className="mt-[6px] text-[18px] font-extrabold text-white">지금 즉시</Text>
              <Text className="mt-[4px] text-[13px] text-white/70">바로 큐 진입</Text>
            </Card>
          </View>

          <Text variant="h1" className="mt-[26px] text-[26px] leading-[34px]">
            12시간 기다리지 말고 지금 시작
          </Text>
          <Text className="mt-[8px] text-[15.5px] leading-[20px] text-ink-3">
            방을 나간 후 12시간 제한을 면제해드려요
          </Text>

          <View className="mt-[26px] gap-[10px]">
            {PAYMENT_PACKS.map((pack) => (
              <Card key={pack.id} className="border-0 bg-paper px-[16px] py-[15px]">
                <Text className="text-[15.5px] font-extrabold text-ink">
                  {pack.label} · {pack.price}
                </Text>
              </Card>
            ))}
          </View>
        </View>

        <View className="absolute inset-0 bg-black/55" />

        <View className="flex-1 justify-center px-[24px]">
          <Card className="items-center px-[20px] py-[22px]">
            <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-danger-soft">
              <Text className="text-[22px] font-extrabold text-danger">!</Text>
            </View>

            <Text variant="h2" className="mt-[14px] text-center text-[17px] font-extrabold">
              결제가 완료되지 않았어요
            </Text>
            <Text className="mt-[6px] text-center text-[14.5px] leading-[20px] text-ink-3">
              결제 도중 문제가 생겼어요.{'\n'}12시간 제한은 그대로 유지돼요.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="PG 에러 코드 복사"
              onPress={copyErrorCode}
              className="mt-[14px] w-full rounded-md bg-bg-2 px-[14px] py-[12px]"
            >
              <Text className="text-[13px] font-bold text-ink-3">error_code</Text>
              <Text className="mt-[4px] text-[15px] font-extrabold leading-[18px] text-ink">
                {errorCode}
              </Text>
              <Text className="mt-[5px] text-[13.5px] text-ink-3">
                탭하면 고객센터에 전달할 코드를 복사해요.
              </Text>
            </Pressable>

            <View className="mt-[12px] w-full flex-row gap-[8px] rounded-md bg-info-soft px-[14px] py-[12px]">
              <Text className="text-[15px] font-extrabold text-info">✓</Text>
              <Text className="flex-1 text-[14.5px] leading-[19px] text-ink-2">
                <Text className="font-extrabold text-ink">추가 페널티 없음</Text>
                {' '}
                — 결제 실패 때문에 제한 시간이 늘어나지 않아요.
              </Text>
            </View>

            <View className="mt-[14px] w-full gap-[6px]">
              <Button fullWidth size="sm" variant="ink" onPress={() => router.replace(ROUTES.booster)}>
                스토어 결제 다시 시도
              </Button>
              <Button
                fullWidth
                size="sm"
                variant="secondary"
                onPress={() =>
                  router.replace({
                    pathname: '/(app)/support',
                    params: { category: '결제·환불' },
                  })
                }
              >
                고객센터 문의
              </Button>
              <Button fullWidth size="sm" variant="tertiary" onPress={() => router.replace(ROUTES.home)}>
                닫기 (홈으로)
              </Button>
            </View>
          </Card>
        </View>

        {copied ? (
          <View className="absolute bottom-[34px] left-0 right-0 items-center">
            <View className="rounded-full bg-ink px-[16px] py-[10px]">
              <Text className="text-[14.5px] font-bold text-white">복사됨</Text>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

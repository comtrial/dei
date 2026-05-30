import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger, POLICY } from '@dei/shared';
import {
  Badge,
  Banner,
  BottomActionBar,
  Button,
  Card,
  ChoiceList,
  CompareCard,
  Text,
  TopNav,
} from '@dei/ui';

import { PAYMENT_PACKS } from '@/lib/b-flow';
import { purchaseInstantRematch } from '@/lib/portone.stub';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

export default function BoosterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string>(PAYMENT_PACKS[0].id);
  const [isPaying, setIsPaying] = useState(false);

  const handlePay = () => {
    void logger.withErrorCapture(
      'booster.purchase',
      async () => {
        setIsPaying(true);
        await purchaseInstantRematch(user?.id ?? 'anonymous');
        router.replace(ROUTES.queue);
      },
      { tags: { screen: 'booster', action: 'purchase' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'booster', action: 'purchase-catch' },
        });
        router.replace(ROUTES.boosterFailed);
      })
      .finally(() => setIsPaying(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="바로 매치" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[132px] pt-[22px]">
          <View className="flex-row items-center gap-[8px]">
            <Badge variant="count">잔여 0회</Badge>
            <Badge variant="discount">1회 결제</Badge>
          </View>

          <Text variant="h1" className="mt-[26px] text-[26px] leading-[34px]">
            24시간 기다리지 말고 지금 시작
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            방을 나간 뒤 생긴 재매칭 제한을 바로 매치로 한 번 면제해요.
          </Text>

          <CompareCard
            className="mt-[24px]"
            current={{
              label: '그냥 기다리기',
              value: '24시간',
              sub: '제한 종료 후 가능',
            }}
            now={{
              label: '바로 매치',
              value: '즉시',
              sub: '결제 성공 후 큐 진입',
            }}
          />

          <View className="mt-[26px]">
            <Text variant="eyebrow" tone="ink-3">
              상품 선택
            </Text>
            <ChoiceList
              tone="accent"
              value={selectedProductId}
              onChange={setSelectedProductId}
              options={PAYMENT_PACKS.map((pack) => ({
                label: `${pack.label} · ${pack.sub}`,
                value: pack.id,
              }))}
              className="mt-[10px]"
            />
          </View>

          <Card className="mt-[24px] px-[16px] py-[16px]">
            <Text className="text-[14px] font-extrabold text-ink">결제 안내</Text>
            <Text className="mt-[8px] text-[12.5px] leading-[19px] text-ink-2">
              최종 금액과 결제 수단은 결제 단계에서 다시 확인해요. 정기결제가 아닌
              1회 결제입니다.
            </Text>
            <View className="mt-[12px] flex-row flex-wrap gap-[6px]">
              {['PortOne', '1회 결제', '정기결제 아님', '미사용 환불 문의 가능'].map((label) => (
                <Badge key={label} variant="count">{label}</Badge>
              ))}
            </View>
          </Card>

          {!POLICY.flags.enablePayments ? (
            <Banner tone="warn" icon="!" title="결제 준비 중">
              지금은 결제 수단 확인이 완료되지 않았어요. 결제가 열리지 않으면 고객센터로 문의해주세요.
            </Banner>
          ) : null}

          <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.support)}>
            <Text className="mt-[18px] text-center text-[12px] font-semibold text-ink-3">
              환불·결제 문의는 고객센터에서 접수할 수 있어요.
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={isPaying} onPress={handlePay}>
          {isPaying ? '결제 준비 중' : '바로 매치 시작'}
        </Button>
      </BottomActionBar>
    </SafeAreaView>
  );
}

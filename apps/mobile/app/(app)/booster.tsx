import { Payment } from '@portone/react-native-sdk';
import type { PaymentRequest, PaymentResponse } from '@portone/browser-sdk/v2';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRematchRestriction, logger, POLICY } from '@dei/shared';
import {
  AlertDialog,
  Badge,
  BottomActionBar,
  Button,
  Card,
  ChoiceList,
  CompareCard,
  IconButton,
  Spinner,
  Text,
  TopNav,
} from '@dei/ui';

import { PAYMENT_PACKS } from '@/lib/b-flow';
import { enqueueMatchQueue } from '@/lib/matching';
import { getAppNotificationEnabled, registerPushToken } from '@/lib/notifications.stub';
import { requestPermission } from '@/lib/permissions';
import {
  confirmInstantRematchPayment,
  startInstantRematchPayment,
} from '@/lib/portone.stub';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

function formatWaitingDuration(remainingMs: number) {
  const totalMinutes = Math.max(Math.ceil(remainingMs / (60 * 1000)), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}시간 ${minutes}분`;
}

function formatAvailableAt(remainingMs: number) {
  const availableAt = new Date(Date.now() + Math.max(remainingMs, 0));
  const now = new Date();
  const dayLabel =
    availableAt.toDateString() === now.toDateString()
      ? '오늘'
      : '내일';
  const hours = `${availableAt.getHours()}`.padStart(2, '0');
  const minutes = `${availableAt.getMinutes()}`.padStart(2, '0');

  return `${dayLabel} ${hours}:${minutes} 가능`;
}

export default function BoosterScreen() {
  const router = useRouter();
  const { memberIds } = useLocalSearchParams<{ memberIds?: string }>();
  const { user } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string>(
    PAYMENT_PACKS[1]?.id ?? PAYMENT_PACKS[0].id,
  );
  const [isPaying, setIsPaying] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [lastRoomLeaveAt, setLastRoomLeaveAt] = useState<string | null>(null);
  const [passCount, setPassCount] = useState(0);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [paymentProductId, setPaymentProductId] = useState<string | null>(null);
  const selectedPack =
    PAYMENT_PACKS.find((pack) => pack.id === selectedProductId) ?? PAYMENT_PACKS[0];
  const queueMemberIds = memberIds
    ? memberIds.split(',').map((id) => id.trim()).filter(Boolean)
    : [];
  const rematchRestriction = getRematchRestriction(lastRoomLeaveAt);
  const waitingValue = rematchRestriction.restricted
    ? formatWaitingDuration(rematchRestriction.remainingMs)
    : `${POLICY.matching.rematchCooldownHours}시간`;
  const waitingSub = rematchRestriction.restricted
    ? formatAvailableAt(rematchRestriction.remainingMs)
    : '방 이탈 후 제한 시간';

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'booster.load-state',
      async () => {
        const [{ data: profile, error: profileError }, { data: passes, error: passError }] =
          await Promise.all([
            supabase
              .from('profile')
              .select('last_room_leave_at')
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('pass')
              .select('remaining')
              .eq('user_id', user.id)
              .eq('status', 'active'),
          ]);

        if (profileError) throw profileError;
        if (passError) throw passError;

        setLastRoomLeaveAt(profile?.last_room_leave_at ?? null);
        setPassCount(passes?.reduce((sum, pass) => sum + pass.remaining, 0) ?? 0);
      },
      { tags: { screen: 'booster', action: 'load-state' } },
    );
  }, [user]);

  const handlePay = () => {
    void logger.withErrorCapture(
      'booster.purchase',
      async () => {
        setIsPaying(true);
        const request = await startInstantRematchPayment(selectedPack.id);
        setPaymentProductId(selectedPack.id);
        setPaymentRequest(request);
      },
      { tags: { screen: 'booster', action: 'purchase' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'booster', action: 'purchase-catch' },
        });
        setStartFailed(true);
      })
      .finally(() => setIsPaying(false));
  };

  const closePayment = () => {
    setPaymentRequest(null);
    setPaymentProductId(null);
    setIsPaying(false);
  };

  const handlePaymentComplete = (response: PaymentResponse) => {
    if (response.code) {
      const failure = response as PaymentResponse & { message?: string };
      closePayment();
      router.replace({
        pathname: '/(app)/booster-failed',
        params: {
          code: response.code,
          message: failure.message ?? response.code,
        },
      });
      return;
    }

    void logger.withErrorCapture(
      'booster.payment-complete',
      async () => {
        setIsPaying(true);
        await confirmInstantRematchPayment(
          response,
          paymentProductId ?? selectedPack.id,
        );

        if (!user?.id) {
          throw new Error('authentication required');
        }

        const appNotificationEnabled = await getAppNotificationEnabled(user.id);
        if (!appNotificationEnabled) {
          closePayment();
          router.replace({
            pathname: '/(app)/permission/notification',
            params: { memberIds: queueMemberIds.length > 0 ? queueMemberIds.join(',') : user.id },
          });
          return;
        }

        const status = await requestPermission('notification');
        if (status !== 'granted') {
          closePayment();
          router.replace({
            pathname: '/(app)/permission/notification',
            params: { memberIds: queueMemberIds.length > 0 ? queueMemberIds.join(',') : user.id },
          });
          return;
        }

        await registerPushToken(user.id).catch((error) => {
          logger.captureException(error, {
            tags: { screen: 'booster', action: 'register-push-token' },
          });
        });
        await enqueueMatchQueue(queueMemberIds);
        closePayment();
        router.replace(ROUTES.queue);
      },
      { tags: { screen: 'booster', action: 'payment-complete' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'booster', action: 'payment-complete-catch' },
        });
        closePayment();
        router.replace(ROUTES.boosterFailed);
      })
      .finally(() => setIsPaying(false));
  };

  const handlePaymentError = (error: Error) => {
    logger.captureException(error, {
      tags: { screen: 'booster', action: 'payment-sdk-error' },
    });
    closePayment();
    router.replace({
      pathname: '/(app)/booster-failed',
      params: {
        code: 'payment_sdk_error',
        message: error.message,
      },
    });
  };

  if (paymentRequest) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="items-end px-[18px] pt-[8px]">
          <IconButton
            glyph={X}
            variant="filled-circle"
            size={36}
            accessibilityLabel="결제 닫기"
            onPress={closePayment}
          />
        </View>
        <View className="flex-1">
          <Payment
            request={paymentRequest}
            onComplete={handlePaymentComplete}
            onError={handlePaymentError}
          />
        </View>

        {isPaying ? (
          <View className="absolute inset-0 items-center justify-center bg-bg/80 px-[32px]">
            <Spinner size={80} accessibilityLabel="결제 확인 중" />
            <Text variant="body" tone="ink-3" className="mt-[18px] text-center">
              결제 결과를 확인하고 있어요
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="바로 매치" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[132px] pt-[22px]">
          {passCount > 0 ? (
            <View className="mb-[12px] flex-row items-center gap-[8px]">
              <Badge variant="count">잔여 {passCount}회</Badge>
            </View>
          ) : null}
          <CompareCard
            className="mt-[2px]"
            current={{
              label: '그냥 기다리기',
              value: waitingValue,
              sub: waitingSub,
            }}
            now={{
              label: '바로 매치',
              value: '지금 즉시',
              sub: '바로 큐 진입',
            }}
          />
          <Text variant="h1" className="mt-[26px] text-[26px] leading-[34px]">
            24시간 기다리지 말고 지금 시작
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            방을 나간 후 24시간 제한을 면제해드려요
          </Text>

          <View className="mt-[26px]">
            <Text variant="eyebrow" tone="ink-3">
              상품 선택
            </Text>
            <ChoiceList
              tone="accent"
              value={selectedProductId}
              onChange={setSelectedProductId}
              options={PAYMENT_PACKS.map((pack) => ({
                label: (
                  <View className="flex-1 flex-row items-center justify-between gap-[10px]">
                    <View className="flex-1">
                      <Text className="text-[13.5px] font-extrabold text-ink">
                        {pack.label}
                        {pack.badge ? (
                          <Text className="text-[11px] font-extrabold text-accent">
                            {' '}
                            {pack.badge}
                          </Text>
                        ) : null}
                      </Text>
                      <Text className="mt-[2px] text-[11.5px] text-ink-3">{pack.sub}</Text>
                    </View>
                    <Text className="text-[13.5px] font-extrabold text-ink">{pack.price}</Text>
                  </View>
                ),
                value: pack.id,
              }))}
              className="mt-[10px]"
            />
          </View>

          <Card className="mt-[24px] px-[16px] py-[16px]">
            <View className="flex-row flex-wrap gap-[6px]">
              {['PortOne', 'VISA', 'KB Pay'].map((label) => (
                <Badge key={label} variant="count">{label}</Badge>
              ))}
            </View>
            <Text className="mt-[14px] text-[12.5px] leading-[19px] text-ink-2">
              ✓ 1회 결제 · 정기결제 아님
            </Text>
            <Text className="mt-[5px] text-[12.5px] leading-[19px] text-ink-2">
              ✓ 미사용 시 7일 내 환불
            </Text>
          </Card>

        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={isPaying} onPress={handlePay}>
          {isPaying ? '결제 진행 중' : `${selectedPack.price} · 바로 매치 시작`}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={startFailed}
        tone="warn"
        icon="!"
        title="결제를 시작하지 못했어요"
        description="가격 옵션과 결제 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요."
        actions={[
          { label: '확인', variant: 'secondary', onPress: () => setStartFailed(false) },
          {
            label: '다시 시도',
            variant: 'ink',
            onPress: () => {
              setStartFailed(false);
              handlePay();
            },
          },
        ]}
        onDismiss={() => setStartFailed(false)}
      />
    </SafeAreaView>
  );
}

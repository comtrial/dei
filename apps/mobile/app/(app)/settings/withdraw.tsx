import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  Button,
  ChoiceList,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { WITHDRAW_REASONS } from '@/lib/b-flow';
import { withdrawAccount } from '@/lib/portone.stub';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

export default function WithdrawScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [failure, setFailure] = useState<{ description: string; title: string } | null>(null);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.withdraw_screen_entered);
  }, []);

  const canRequest = !!reason && (reason !== 'other' || detail.trim().length > 0);

  const withdraw = () => {
    if (!canRequest || isWithdrawing) {
      return;
    }

    void logger.withErrorCapture(
      'withdraw.confirm',
      async () => {
        setIsConfirmOpen(false);
        setIsWithdrawing(true);
        analytics.capture(ANALYTICS_EVENTS.withdraw_confirmed, {
          reason,
        });
        await withdrawAccount({
          detail: detail.trim() || undefined,
          reason: reason!,
        });
        await signOut().catch((error) => {
          logger.captureException(error, {
            tags: { screen: 'withdraw', action: 'sign-out-after-withdraw' },
          });
        });
        router.replace(ROUTES.splash);
      },
      { tags: { screen: 'withdraw', action: 'confirm' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'withdraw', action: 'confirm-catch' },
        });
        setFailure({
          title: '탈퇴 처리에 실패했어요',
          description: '잠시 후 다시 시도해주세요.',
        });
      })
      .finally(() => setIsWithdrawing(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="회원 탈퇴" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[22px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            정말 탈퇴하시겠어요?
          </Text>
          <Text className="mt-[8px] text-[15.5px] leading-[20px] text-ink-3">
            탈퇴 전에 꼭 알아두세요.
          </Text>

          <Banner tone="danger" icon="!" title="영구 삭제됩니다">
            프로필·사진·자기소개, 잔여 바로 매치(환불 불가), 결제 이력이 삭제돼요. 같은 번호로는 30일 동안 다시 가입할 수 없어요.
          </Banner>

          <ChoiceList
            tone="danger"
            value={reason}
            onChange={setReason}
            options={WITHDRAW_REASONS.map((item) => ({
              ...item,
              conditionalInput:
                item.value === 'other' ? (
                  <Textarea
                    value={detail}
                    onChangeText={setDetail}
                    maxLength={200}
                    showCount
                    placeholder="떠나는 이유를 적어주세요"
                  />
                ) : undefined,
            }))}
            className="mt-[24px]"
          />
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button
          testID="withdraw-submit"
          fullWidth
          variant="ink"
          disabled={!canRequest || isWithdrawing}
          onPress={() => setIsConfirmOpen(true)}
          accessibilityLabel="회원 탈퇴하기"
          className="rounded-full bg-danger"
          textClassName="text-[15px] font-extrabold"
        >
          {isWithdrawing ? '탈퇴 처리 중' : '회원 탈퇴하기'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={isConfirmOpen}
        tone="danger"
        icon="!"
        title="정말 탈퇴할까요?"
        description="탈퇴하면 프로필과 매칭 정보가 영구 삭제되고, 같은 번호로는 30일 동안 다시 가입할 수 없어요."
        actions={[
          {
            label: '계속 이용할게요',
            variant: 'secondary',
            testID: 'withdraw-cancel',
            onPress: () => setIsConfirmOpen(false),
          },
          {
            label: isWithdrawing ? '탈퇴 처리 중' : '네, 탈퇴할게요',
            variant: 'ink',
            testID: 'withdraw-confirm',
            onPress: withdraw,
          },
        ]}
        onDismiss={() => {
          if (!isWithdrawing) {
            setIsConfirmOpen(false);
          }
        }}
      />

      <AlertDialog
        visible={Boolean(failure)}
        tone="info"
        icon="i"
        title={failure?.title ?? ''}
        description={failure?.description ?? ''}
        actions={[
          { label: '확인', variant: 'ink', onPress: () => setFailure(null) },
        ]}
        onDismiss={() => setFailure(null)}
      />
    </SafeAreaView>
  );
}

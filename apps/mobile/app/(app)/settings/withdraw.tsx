import { IdentityVerification } from '@portone/react-native-sdk';
import type { IdentityVerificationRequest, IdentityVerificationResponse } from '@portone/browser-sdk/v2';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  Button,
  ChoiceList,
  IconButton,
  SlideToConfirm,
  Spinner,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { WITHDRAW_REASONS } from '@/lib/b-flow';
import {
  confirmWithdrawIdentityVerification,
  startWithdrawIdentityVerification,
  withdrawAccount,
} from '@/lib/portone.stub';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

export default function WithdrawScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [identityRequest, setIdentityRequest] = useState<IdentityVerificationRequest | null>(null);
  const [isIdentityBusy, setIsIdentityBusy] = useState(false);
  const [failure, setFailure] = useState<{ description: string; title: string } | null>(null);
  const identityRequestRef = useRef<IdentityVerificationRequest | null>(null);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.withdraw_screen_entered);
  }, []);

  const canRequest = !!reason && (reason !== 'other' || detail.trim().length > 0);

  const closeIdentityVerification = useCallback(() => {
    identityRequestRef.current = null;
    setIdentityRequest(null);
    setIsIdentityBusy(false);
  }, []);

  const confirmIdentity = () => {
    if (isIdentityBusy) {
      return;
    }

    void logger.withErrorCapture(
      'withdraw.identity-start',
      async () => {
        setIsIdentityBusy(true);
        const request = await startWithdrawIdentityVerification();
        identityRequestRef.current = request;
        setIdentityRequest(request);
      },
      { tags: { screen: 'withdraw', action: 'identity-start' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'withdraw', action: 'identity-start-catch' },
        });
        setFailure({
          title: '본인인증 재확인을 시작하지 못했어요',
          description: '잠시 후 다시 시도해주세요.',
        });
      })
      .finally(() => setIsIdentityBusy(false));
  };

  const handleIdentityComplete = useCallback(
    (response: IdentityVerificationResponse) => {
      const request = identityRequestRef.current;

      void logger.withErrorCapture(
        'withdraw.identity-confirm',
        async () => {
          setIsIdentityBusy(true);
          await confirmWithdrawIdentityVerification(
            response,
            request?.identityVerificationId,
          );
          identityRequestRef.current = null;
          setIdentityRequest(null);
          setIdentityConfirmed(true);
        },
        { tags: { screen: 'withdraw', action: 'identity-confirm' } },
      )
        .catch((error) => {
          logger.captureException(error, {
            tags: { screen: 'withdraw', action: 'identity-confirm-catch' },
          });
          closeIdentityVerification();
          setFailure({
            title: '본인인증 재확인을 완료하지 못했어요',
            description: '인증 도중 취소되었거나 시간이 초과됐어요. 다시 시도해주세요.',
          });
        })
        .finally(() => setIsIdentityBusy(false));
    },
    [closeIdentityVerification],
  );

  const handleIdentityError = useCallback(
    (error: Error) => {
      logger.captureException(error, {
        tags: { screen: 'withdraw', action: 'identity-sdk-error' },
      });
      closeIdentityVerification();
      setFailure({
        title: '본인인증 재확인을 완료하지 못했어요',
        description: '인증 도중 취소되었거나 시간이 초과됐어요. 다시 시도해주세요.',
      });
    },
    [closeIdentityVerification],
  );

  const withdraw = () => {
    if (!canRequest || !identityConfirmed) {
      return;
    }

    void logger.withErrorCapture(
      'withdraw.confirm',
      async () => {
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
    ).catch(() => {
      setFailure({
        title: '탈퇴 처리에 실패했어요',
        description: '잠시 후 다시 시도해주세요.',
      });
    });
  };

  if (identityRequest) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="items-end px-[18px] pt-[8px]">
          <IconButton
            glyph={X}
            variant="filled-circle"
            size={36}
            accessibilityLabel="본인인증 재확인 닫기"
            onPress={closeIdentityVerification}
          />
        </View>
        <View className="flex-1">
          <IdentityVerification
            request={identityRequest}
            onComplete={handleIdentityComplete}
            onError={handleIdentityError}
            javaScriptCanOpenWindowsAutomatically
            setSupportMultipleWindows={false}
          />
        </View>

        {isIdentityBusy ? (
          <View className="absolute inset-0 items-center justify-center bg-bg/80 px-[32px]">
            <Spinner size={80} accessibilityLabel="본인인증 재확인 중" />
            <Text variant="body" tone="ink-3" className="mt-[18px] text-center">
              본인인증 정보를 다시 확인하고 있어요
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

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

          <Button
            fullWidth
            variant={identityConfirmed ? 'secondary' : 'ink'}
            disabled={isIdentityBusy}
            onPress={confirmIdentity}
            className="mt-[20px]"
          >
            {isIdentityBusy
              ? '본인인증 재확인 중'
              : identityConfirmed
                ? '본인인증 재확인 완료'
                : '본인인증 재확인 필요 · 인증하기 ›'}
          </Button>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <SlideToConfirm
          disabled={!canRequest || !identityConfirmed}
          label="밀어서 탈퇴하기"
          onConfirm={withdraw}
          className={!canRequest || !identityConfirmed ? 'opacity-40' : undefined}
        />
      </BottomActionBar>

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

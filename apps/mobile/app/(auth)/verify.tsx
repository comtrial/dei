import { IdentityVerification } from '@portone/react-native-sdk';
import type { IdentityVerificationRequest, IdentityVerificationResponse } from '@portone/browser-sdk/v2';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  BrandTransitionFrame,
  IconButton,
  Spinner,
  Text,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { ensureLatestTermsAgreementForCurrentUser } from '@/lib/terms-agreement';
import {
  confirmIdentityVerification,
  IdentityVerificationError,
  recordIdentityVerificationFailure,
  startIdentityVerification,
} from '@/lib/portone.stub';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/**
 * S03 — 본인인증 진행 중 (PortOne)
 * ==================================================================
 * 담당자: B
 * 화면 목적: 외부 본인인증 SDK 호출 → 인증기관(NICE/KCB) 이탈 동안의 1~2초
 *           대기 + 이탈 방지. 인증 콜백 도착 시 자동으로 프로필(S04)로 진행.
 * 의존 DS 컴포넌트: Text · IconButton(우상단 X 닫기, S03f 공유) ·
 *   BrandTransitionFrame('dei. → PortOne' 전환 시각화) · Spinner(대형
 *   ProgressRing) · PulseRing(spinner primitive 변형) · AlertDialog(CI중복·
 *   연속실패 잠금·19세미만 조건부 시스템 alert)  [@dei/ui]
 * 의존 데이터: PortOne 본인인증 결과(실명·생년월일·성별·CI, 프로필 root of
 *   trust) / CI 중복 조회(동일 CI → 기존 user 강제 로그인) / 연속 실패
 *   카운터 + 24h 잠금 상태
 * 발생 이벤트(PostHog): S03:phone_auth_cancelled_by_user (F-Auth)
 * 서버 의존(L1): PortOne SDK 콜백 검증 Edge Function(인증 결과 검증·CI 해시
 *   저장) / CI 기반 계정 조회·생성·로그인(중복 시 기존 계정 토큰 발급) /
 *   실패 횟수 누적·잠금 임계값(5회/24h) 관리 서버 로직
 * 정책 의존(L2): 19+ 연령 게이트(L0 검증) / 연속 실패 5회 → 24h 잠금 /
 *   CI 중복 = 새 계정 생성 금지·기존 계정 강제 / 본인인증 정보 변경
 *   불가(가입 시 1회)
 * 와이어프레임 참조: all-screens S03
 *
 * 현재 구현: PortOne SDK 호출, Edge Function 검증, CI 중복 기존 계정 세션 전환,
 * 19세 미만/연속 실패 잠금/재가입 제한 분기를 실제 경로로 처리한다.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const { ensureAnonymousSession, promoteWithIdentity, signOut } = useAuth();
  const [verificationRequest, setVerificationRequest] =
    useState<IdentityVerificationRequest | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [startAttempt, setStartAttempt] = useState(0);
  const [startFailed, setStartFailed] = useState(false);
  const hasStartedRef = useRef(false);
  const verificationRequestRef = useRef<IdentityVerificationRequest | null>(null);

  const leaveAuthFlow = useCallback(() => {
    void signOut().catch((error) => {
      logger.captureException(error, {
        tags: { feature: 'identity-verification', action: 'sign-out-after-block' },
      });
    });
    router.replace(ROUTES.splash);
  }, [router, signOut]);

  const handleIdentityError = useCallback(
    (error: unknown) => {
      if (error instanceof IdentityVerificationError) {
        if (error.code === 'IDENTITY_ALREADY_VERIFIED') {
          router.replace(ROUTES.splash);
          return;
        }

        if (error.code === 'UNDERAGE') {
          Alert.alert('이용할 수 없어요', error.message, [
            { text: '확인', onPress: leaveAuthFlow },
          ]);
          return;
        }

        if (error.code === 'CI_DUPLICATE') {
          Alert.alert('이미 가입된 번호예요', '기존 계정 로그인 세션을 받지 못했어요. 잠시 후 다시 시도해주세요.', [
            { text: '확인', onPress: () => router.replace(ROUTES.verifyFailed) },
          ]);
          return;
        }

        if (error.code === 'IDENTITY_LOCKED') {
          Alert.alert('잠시 후 다시 시도해주세요', error.message, [
            { text: '확인', onPress: () => router.replace(ROUTES.terms) },
          ]);
          return;
        }

        if (error.code === 'REJOIN_LOCKED') {
          Alert.alert('다시 가입할 수 없어요', error.message, [
            { text: '확인', onPress: leaveAuthFlow },
          ]);
          return;
        }
      } else {
        logger.captureException(error, {
          tags: { feature: 'identity-verification', action: 'handle-error' },
        });
      }

      router.replace(ROUTES.verifyFailed);
    },
    [leaveAuthFlow, router],
  );

  const handleCancel = useCallback(() => {
    void logger.withErrorCapture(
      'identity.cancel',
      async () => {
        analytics.capture(ANALYTICS_EVENTS.phone_auth_cancelled_by_user);
        const identityVerificationId = verificationRequestRef.current?.identityVerificationId;

        if (identityVerificationId) {
          try {
            await recordIdentityVerificationFailure({
              failureCode: 'SDK_CANCELLED',
              failureMessage: 'user cancelled identity verification',
              identityVerificationId,
            });
          } catch (error) {
            if (error instanceof IdentityVerificationError) {
              if (error.code === 'IDENTITY_LOCKED') {
                handleIdentityError(error);
                return;
              }
            } else {
              logger.captureException(error, {
                tags: { feature: 'identity-verification', action: 'record-cancel' },
              });
            }
          }
        }

        router.replace(ROUTES.terms);
      },
      { tags: { feature: 'identity-verification', action: 'cancel' } },
    ).catch(() => undefined);
  }, [handleIdentityError, router]);

  const handleComplete = useCallback(
    async (response: IdentityVerificationResponse) => {
      const request = verificationRequestRef.current;
      setIsConfirming(true);

      try {
        const result = await confirmIdentityVerification(
          response,
          request?.identityVerificationId,
        );
        await promoteWithIdentity(result);
        analytics.capture(ANALYTICS_EVENTS.phone_verification_succeeded, {
          existing_member: Boolean(result.existingMember),
        });
        setVerificationRequest(null);
        verificationRequestRef.current = null;

        if (result.existingMember) {
          await ensureLatestTermsAgreementForCurrentUser();
          Alert.alert('이미 가입된 번호예요', '그 계정으로 들어갈게요.', [
            { text: '확인', onPress: () => router.replace(ROUTES.splash) },
          ]);
          return;
        }

        router.replace(ROUTES.profileStep1);
      } catch (error) {
        setVerificationRequest(null);
        verificationRequestRef.current = null;
        handleIdentityError(error);
      } finally {
        setIsConfirming(false);
      }
    },
    [handleIdentityError, promoteWithIdentity, router],
  );

  const handleSdkError = useCallback(
    (sdkError: Error) => {
      const identityVerificationId = verificationRequestRef.current?.identityVerificationId;

      if (!identityVerificationId) {
        handleIdentityError(sdkError);
        return;
      }

      void recordIdentityVerificationFailure({
        failureCode: 'SDK_ERROR',
        failureMessage: sdkError.message,
        identityVerificationId,
      })
        .then(() => {
          setVerificationRequest(null);
          verificationRequestRef.current = null;
          router.replace(ROUTES.verifyFailed);
        })
        .catch(handleIdentityError);
    },
    [handleIdentityError, router],
  );

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    const start = async () => {
      setStartFailed(false);

      try {
        await ensureAnonymousSession();
        const request = await startIdentityVerification();
        verificationRequestRef.current = request;
        setVerificationRequest(request);
      } catch (error) {
        if (error instanceof IdentityVerificationError) {
          handleIdentityError(error);
          return;
        }

        logger.captureException(error, {
          tags: { feature: 'identity-verification', action: 'start-sdk' },
        });
        setStartFailed(true);
      }
    };

    void start();
  }, [ensureAnonymousSession, handleIdentityError, startAttempt]);

  const retryStart = () => {
    setStartFailed(false);
    hasStartedRef.current = false;
    setStartAttempt((attempt) => attempt + 1);
  };

  if (verificationRequest) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="items-end px-[18px] pt-[8px]">
          <IconButton
            glyph={X}
            variant="filled-circle"
            size={36}
            accessibilityLabel="본인인증 취소"
            onPress={handleCancel}
            testID="verify-close"
          />
        </View>

        <View className="flex-1">
          <IdentityVerification
            request={verificationRequest}
            onComplete={handleComplete}
            onError={handleSdkError}
            javaScriptCanOpenWindowsAutomatically
            setSupportMultipleWindows={false}
          />
        </View>

        {isConfirming ? (
          <View className="absolute inset-0 items-center justify-center bg-bg/80 px-[32px]">
            <Spinner size={80} accessibilityLabel="본인인증 결과 확인 중" />
            <Text variant="body" tone="ink-3" className="mt-[18px] text-center">
              인증 결과를 확인하고 있어요
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-end px-[18px] pt-[8px]">
        <IconButton
          glyph={X}
          variant="filled-circle"
          size={36}
          accessibilityLabel="본인인증 취소"
          onPress={handleCancel}
          testID="verify-close"
        />
      </View>

      <View className="flex-1 items-center px-[32px] pb-[32px] pt-[100px]">
        <BrandTransitionFrame target="PortOne" className="mb-[30px] mt-auto" />

        <Spinner
          size={80}
          accessibilityLabel="본인인증 진행 중"
          className="mb-[22px]"
        />

        <Text
          variant="h2"
          className="text-center text-[19px] font-bold leading-[27px]"
        >
          PortOne 본인인증을{'\n'}진행하고 있어요
        </Text>
        <Text
          variant="body"
          tone="ink-3"
          className="mt-[8px] text-center text-[15px] leading-[20px]"
        >
          NICE / KCB 본인인증 기관으로{'\n'}잠시 이동합니다
        </Text>
        <Text
          variant="micro"
          tone="ink-4"
          className="mt-auto text-center text-[13px] leading-[17px]"
        >
          인증이 끝나면 자동으로 진행돼요
        </Text>
      </View>

      <AlertDialog
        visible={startFailed}
        tone="warn"
        icon="!"
        title="본인인증을 시작하지 못했어요"
        description="PortOne 본인인증을 시작하지 못했어요. 잠시 후 다시 시도해주세요."
        actions={[
          { label: '취소', variant: 'secondary', onPress: () => router.replace(ROUTES.terms) },
          { label: '재시도', variant: 'ink', onPress: retryStart },
        ]}
        onDismiss={() => setStartFailed(false)}
      />
    </SafeAreaView>
  );
}

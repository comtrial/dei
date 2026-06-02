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
  Button,
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const DEV_IDENTITY_BYPASS_ENABLED = ['1', 'true', 'TRUE', 'yes'].includes(
  process.env.EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS ?? '',
);

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

    // 개발용 바이패스가 켜진 환경(PortOne 미연동)에서는 진입 시 PortOne 자동호출을
    // 하지 않는다. 자동호출이 실패하면 '시작 못했어요' 다이얼로그→terms 로 튕겨
    // 바이패스 버튼을 쓰기도 전에 막히기 때문. BYPASS 일 땐 익명 세션만 만들고
    // '개발용 본인인증 완료' 버튼으로 진행한다.
    if (DEV_IDENTITY_BYPASS_ENABLED) {
      void ensureAnonymousSession().catch((error) => {
        logger.captureException(error, {
          tags: { feature: 'identity-verification', action: 'dev-bypass-ensure-session' },
        });
      });
      return;
    }

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

  const completeDevIdentityBypass = useCallback(() => {
    if (!DEV_IDENTITY_BYPASS_ENABLED) {
      return;
    }

    void logger.withErrorCapture(
      'identity.dev-bypass',
      async () => {
        const session = await ensureAnonymousSession();
        const userId = session.user.id;
        const { error } = await supabase
          .from('profile')
          .update({
            birth_date: '2000-01-01',
            birth_year: 2000,
            gender: 'female',
            is_adult: true,
          })
          .eq('user_id', userId);

        if (error) {
          throw error;
        }

        // 개발용 바이패스는 약관 동의 화면(S02)을 건너뛰므로 terms_agreement 행이 없다.
        // 그러면 app/index.tsx 부트스트랩의 `if (!termsAgreement) → terms` 가드가
        // 닉네임(step1) 진입 전에 약관으로 튕긴다(이 버그). 바이패스에서도 약관 동의를
        // 기록해 부트스트랩이 정상적으로 step1 로 보내게 한다(FALLBACK 동의값 사용).
        await ensureLatestTermsAgreementForCurrentUser();

        setVerificationRequest(null);
        verificationRequestRef.current = null;
        router.replace(ROUTES.profileStep1);
      },
      { tags: { feature: 'identity-verification', action: 'dev-bypass' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { feature: 'identity-verification', action: 'dev-bypass-catch' },
      });
      setStartFailed(true);
    });
  }, [ensureAnonymousSession, router]);

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

        {DEV_IDENTITY_BYPASS_ENABLED ? (
          <View className="absolute bottom-[28px] left-0 right-0 px-[24px]">
            <Button fullWidth variant="secondary" onPress={completeDevIdentityBypass}>
              개발용 본인인증 완료
            </Button>
          </View>
        ) : null}

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
          className="mt-[8px] text-center text-[13px] leading-[20px]"
        >
          NICE / KCB 본인인증 기관으로{'\n'}잠시 이동합니다
        </Text>
        <Text
          variant="micro"
          tone="ink-4"
          className="mt-auto text-center text-[11px] leading-[17px]"
        >
          인증이 끝나면 자동으로 진행돼요
        </Text>

        {DEV_IDENTITY_BYPASS_ENABLED ? (
          <Button
            fullWidth
            variant="secondary"
            className="mt-[18px]"
            onPress={completeDevIdentityBypass}
          >
            개발용 본인인증 완료
          </Button>
        ) : null}
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

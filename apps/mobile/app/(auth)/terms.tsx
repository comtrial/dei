import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  Checkbox,
  Text,
  TopNav,
} from '@dei/ui';

import { hasVerifiedIdentity } from '@/lib/auth-flow';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { TERMS_VERSION } from '@/lib/b-flow';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { rememberPendingTermsAgreement } from '@/lib/terms-agreement';
import { useAuth } from '@/providers/auth-provider';

/**
 * S02 — 약관 + 19+ 자가확인
 * ==================================================================
 * 담당자: B
 * 화면 목적: 법적 약관 동의 + 19+ 자가확인을 받아 본인인증(외부 SDK) 진입
 *           게이트를 통과시킨다. PRD v0.7 §15 '본인 인증·연령 게이트' 충족.
 * 의존 DS 컴포넌트: Text · TopNav(닫기 < → splash 복귀) · Badge(연령 게이트
 *   '19세 미만 이용 불가' pill) · Card(CheckAll '모두 동의' 마스터 카드)
 *   · Checkbox(모두 동의 + 각 약관 항목 체크) · SettingsRow(약관 항목 행 +
 *   '보기 ›' chevron) · Chip(필수/선택 RequiredTag) · Button(PrimaryCTA
 *   '동의하고 본인인증 시작', 필수 미충족 시 비활성) · AlertDialog(약관 전문
 *   로드 실패 시 재시도)  [@dei/ui]
 * 의존 데이터: 약관 항목 메타·전문(terms/policy versions 테이블 또는 정적
 *   호스팅 문서) / 사용자별 동의 상태(consents/agreements 테이블: 약관 버전 +
 *   동의 시각) / 동의된 약관 버전 vs 현재 버전 비교(재동의 트리거)
 * 발생 이벤트(PostHog): terms_agreement_screen_entered (start · F-Auth
 *   가입+본인인증)  (lib/analytics-taxonomy)
 * 서버 의존(L1): 약관 전문 로드(실패 시 alert+재시도) / 동의 기록 저장
 *   엔드포인트 / 위치정보 동의 플래그는 S04c 지역 자동채움과 연동되므로
 *   프로필 컨텍스트로 전달
 * 정책 의존(L2): 약관 필수/선택 구분(서비스약관·개인정보=필수,
 *   위치·마케팅=선택) / 약관 버전 변경 시 재동의 강제 운영 로직
 * 와이어프레임 참조: all-screens S02
 *
 * 현재 구현: 약관 보기, 최신 약관 버전 동의 저장, 본인인증 진입, 인증된
 * 사용자의 재동의 게이트를 실제 DB 경로로 처리한다.
 */
type AgreementId = 'service' | 'privacy' | 'location' | 'marketing';

type AgreementItem = {
  id: AgreementId;
  label: string;
  required: boolean;
};

const AGREEMENT_ITEMS: AgreementItem[] = [
  { id: 'service', label: '서비스 이용약관', required: true },
  { id: 'privacy', label: '개인정보 처리방침', required: true },
  { id: 'location', label: '위치정보 수집 (매칭 추천용)', required: false },
  { id: 'marketing', label: '마케팅 정보 수신', required: false },
];

const INITIAL_AGREEMENTS: Record<AgreementId, boolean> = {
  service: false,
  privacy: false,
  location: false,
  marketing: false,
};

const AGREEMENT_DETAILS: Record<AgreementId, string> = {
  service: '서비스 이용 조건, 계정 운영, 매칭 및 방 이용 규칙을 안내합니다.',
  privacy: '본인인증, 프로필, 매칭, 신고 처리를 위해 필요한 개인정보 처리 기준을 안내합니다.',
  location: '매칭 추천을 위해 활동 지역 정보를 사용할 수 있어요. 선택 동의 항목입니다.',
  marketing: '이벤트와 혜택 안내를 받을 수 있어요. 선택 동의 항목입니다.',
};

export default function TermsScreen() {
  const router = useRouter();
  const { ensureAnonymousSession, user } = useAuth();
  const [agreements, setAgreements] =
    useState<Record<AgreementId, boolean>>(INITIAL_AGREEMENTS);
  const [verifiedUserNeedsTerms, setVerifiedUserNeedsTerms] = useState(false);
  const [isCheckingUserGate, setIsCheckingUserGate] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [detailId, setDetailId] = useState<AgreementId | null>(null);

  const requiredAccepted = agreements.service && agreements.privacy;
  const allAccepted = Object.values(agreements).every(Boolean);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.terms_agreement_screen_entered);
  }, []);

  useEffect(() => {
    if (!user) {
      setVerifiedUserNeedsTerms(false);
      setIsCheckingUserGate(false);
      return;
    }

    let mounted = true;
    setVerifiedUserNeedsTerms(false);
    setIsCheckingUserGate(true);

    void logger.withErrorCapture(
      'terms.redirect-verified-user',
      async () => {
        const [
          { data: profile, error: profileError },
          { data: verifiedIdentity, error: verifiedIdentityError },
          { data: termsAgreement, error: termsError },
        ] =
          await Promise.all([
            supabase
              .from('profile')
              .select('birth_year, is_adult')
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('auth_verification')
              .select(VERIFIED_IDENTITY_SELECT)
              .eq('user_id', user.id)
              .eq('provider', 'portone')
              .eq('status', 'verified')
              .order('verified_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('terms_agreement')
              .select('id')
              .eq('user_id', user.id)
              .eq('terms_version', TERMS_VERSION)
              .maybeSingle(),
          ]);

        if (profileError) throw profileError;
        if (verifiedIdentityError) throw verifiedIdentityError;
        if (termsError) throw termsError;

        const routedProfile = await repairProfileIdentityFromVerification({
          profile,
          userId: user.id,
          verification: verifiedIdentity,
        });

        if (mounted && hasVerifiedIdentity(routedProfile) && termsAgreement) {
          router.replace(ROUTES.splash);
          return;
        }

        if (mounted && hasVerifiedIdentity(routedProfile)) {
          setVerifiedUserNeedsTerms(true);
        }
      },
      { tags: { screen: 'terms', action: 'redirect-verified-user' } },
    )
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setIsCheckingUserGate(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [router, user]);

  const toggleAll = () => {
    const next = !allAccepted;
    setAgreements({
      service: next,
      privacy: next,
      location: next,
      marketing: next,
    });
  };

  const toggleAgreement = (id: AgreementId) => {
    setAgreements((current) => ({ ...current, [id]: !current[id] }));
  };

  const continueToVerification = () => {
    if (!requiredAccepted || isContinuing || isCheckingUserGate) {
      return;
    }

    void logger.withErrorCapture(
      'terms.save-agreement',
      async () => {
        setIsContinuing(true);
        const session = await ensureAnonymousSession();

        const { error } = await supabase.from('terms_agreement').upsert(
          {
            agreed_at: new Date().toISOString(),
            location_collection: agreements.location,
            marketing_opt_in: agreements.marketing,
            privacy_policy: agreements.privacy,
            service_terms: agreements.service,
            terms_version: TERMS_VERSION,
            user_id: session.user.id,
          },
          { onConflict: 'user_id,terms_version' },
        );

        if (error) {
          throw error;
        }

        rememberPendingTermsAgreement({
          location_collection: agreements.location,
          marketing_opt_in: agreements.marketing,
          privacy_policy: agreements.privacy,
          service_terms: agreements.service,
        });

        if (verifiedUserNeedsTerms) {
          router.replace(ROUTES.splash);
          return;
        }

        router.push(ROUTES.verify);
      },
      { tags: { screen: 'terms', action: 'save-agreement' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'terms', action: 'save-agreement-catch' },
        });
        setSaveFailed(true);
      })
      .finally(() => setIsContinuing(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        left="back"
        className="border-b-0 bg-bg"
        onLeftPress={() => router.replace(ROUTES.splash)}
      />

      <View className="flex-1 px-[24px] pb-[24px] pt-[14px]">
        <Badge variant="age">
          {['19세 미만', '이용 불가']}
        </Badge>

        <View className="mt-[14px]">
          <Text variant="h1" className="text-[26px] leading-[34px]">
            약관 동의 후{'\n'}본인인증을 시작해요
          </Text>
          <Text
            variant="body"
            tone="ink-3"
            className="mt-[8px] text-[13.5px] leading-[20px]"
          >
            만 19세 이상 전용 서비스예요. 본인인증으로 확인할게요.
          </Text>
        </View>

        <Card className="mt-[28px] flex-row items-center gap-[12px] border-0 bg-bg-2 px-[16px] py-[16px]">
          <Checkbox
            variant={allAccepted ? 'master' : 'round'}
            checked={allAccepted}
            onPress={toggleAll}
            testID="terms-check-all"
          />
          <Text className="text-[14.5px] font-bold text-ink">
            모두 동의
          </Text>
        </Card>

        <View className="gap-[14px] px-[6px] pb-[14px] pt-[20px]">
          {AGREEMENT_ITEMS.map((item) => (
            <View key={item.id} className="flex-row items-center gap-[12px]">
              <Checkbox
                checked={agreements[item.id]}
                optional={!item.required}
                onPress={() => toggleAgreement(item.id)}
                testID={`terms-${item.id}`}
              />
              <Text className="flex-1 text-[13px] font-medium text-ink-2">
                {item.label}
              </Text>
              <Badge
                variant="required"
                tone={item.required ? 'accent' : 'info'}
              >
                {item.required ? '필수' : '선택'}
              </Badge>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.label} 전문 보기`}
                onPress={() => setDetailId(item.id)}
              >
                <Text className="ml-[6px] text-[12.5px] font-semibold text-ink-4">보기 ›</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text
          variant="micro"
          tone="ink-3"
          className="mt-[8px] text-center text-[11.5px] leading-[17px]"
        >
          {isCheckingUserGate
            ? '이전 가입 상태를 확인하고 있어요.'
            : verifiedUserNeedsTerms
            ? '최신 약관에 동의하면 바로 이어서 이용할 수 있어요.'
            : '계속하면 PortOne 본인인증으로 이동합니다.'}
        </Text>

        <Button
          fullWidth
          disabled={!requiredAccepted || isContinuing || isCheckingUserGate}
          onPress={continueToVerification}
          testID="terms-continue"
          className="mt-auto py-[18px]"
        >
          {isCheckingUserGate
            ? '확인 중'
            : isContinuing
            ? '저장 중'
            : verifiedUserNeedsTerms
              ? '동의하고 계속'
              : '동의하고 본인인증 시작'}
        </Button>
      </View>

      <AlertDialog
        visible={saveFailed}
        tone="warn"
        icon="!"
        title="약관 동의를 저장하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSaveFailed(false) }]}
        onDismiss={() => setSaveFailed(false)}
      />
      <AlertDialog
        visible={Boolean(detailId)}
        tone="info"
        icon="i"
        title={detailId ? AGREEMENT_ITEMS.find((item) => item.id === detailId)?.label ?? '약관' : '약관'}
        description={detailId ? AGREEMENT_DETAILS[detailId] : ''}
        actions={[{ label: '확인', variant: 'ink', onPress: () => setDetailId(null) }]}
        onDismiss={() => setDetailId(null)}
      />
    </SafeAreaView>
  );
}

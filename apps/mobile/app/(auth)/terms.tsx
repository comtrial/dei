import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Text,
  TopNav,
} from '@dei/ui';

import { ROUTES } from '@/lib/routes';

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
 * B-01 Auth UI shell — 약관/연령 확인 UI 와 S03 진입만 구현.
 * 약관 전문 로드, 동의 버전 저장, DB 연동은 후속 PR 범위다.
 */
type AgreementId = 'service' | 'privacy' | 'adult' | 'location' | 'marketing';

type AgreementItem = {
  id: AgreementId;
  label: string;
  required: boolean;
};

const AGREEMENT_ITEMS: AgreementItem[] = [
  { id: 'service', label: '서비스 이용약관', required: true },
  { id: 'privacy', label: '개인정보 수집 및 이용', required: true },
  { id: 'adult', label: '만 19세 이상입니다', required: true },
  { id: 'location', label: '위치정보 활용 동의', required: false },
  { id: 'marketing', label: '이벤트 및 혜택 알림', required: false },
];

const INITIAL_AGREEMENTS: Record<AgreementId, boolean> = {
  service: false,
  privacy: false,
  adult: false,
  location: false,
  marketing: false,
};

export default function TermsScreen() {
  const router = useRouter();
  const [agreements, setAgreements] =
    useState<Record<AgreementId, boolean>>(INITIAL_AGREEMENTS);

  const requiredAccepted = agreements.service && agreements.privacy && agreements.adult;
  const allAccepted = Object.values(agreements).every(Boolean);

  const toggleAll = () => {
    const next = !allAccepted;
    setAgreements({
      service: next,
      privacy: next,
      adult: next,
      location: next,
      marketing: next,
    });
  };

  const toggleAgreement = (id: AgreementId) => {
    setAgreements((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        left="back"
        title="약관 동의"
        onLeftPress={() => router.replace(ROUTES.splash)}
      />

      <ScrollView className="flex-1">
        <View className="gap-6 px-6 pb-7 pt-7">
          <View className="gap-4">
            <Badge variant="age">
              만 19세 이상 이용 가능
            </Badge>
            <View className="gap-2">
              <Text variant="h1" className="leading-9">
                약관 동의 후 본인인증을 시작해요
              </Text>
              <Text variant="body" tone="ink-3" className="leading-6">
                만 19세 이상 전용 서비스예요. 본인인증으로 확인할게요.
              </Text>
            </View>
          </View>

          <Card className="overflow-hidden">
            <View className="flex-row items-center gap-3 bg-bg-2 px-5 py-5">
              <Checkbox
                variant={allAccepted ? 'master' : 'round'}
                checked={allAccepted}
                onPress={toggleAll}
                testID="terms-check-all"
              />
              <View className="flex-1">
                <Text variant="h2">
                  모두 동의
                </Text>
                <Text variant="micro" tone="ink-3" className="mt-1">
                  필수와 선택 약관을 한 번에 확인해요.
                </Text>
              </View>
            </View>

            {AGREEMENT_ITEMS.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center gap-3 border-t border-line-2 px-5 py-4"
              >
                <Checkbox
                  checked={agreements[item.id]}
                  optional={!item.required}
                  onPress={() => toggleAgreement(item.id)}
                  testID={`terms-${item.id}`}
                />
                <View className="flex-1 flex-row items-center gap-2">
                  <Text variant="body" tone="ink" className="flex-1 text-sm">
                    {item.label}
                  </Text>
                  <Chip
                    variant={item.required ? 'me' : 'default'}
                    label={item.required ? '필수' : '선택'}
                    textClassName={item.required ? 'text-accent font-bold' : undefined}
                  />
                </View>
                <Button variant="tertiary" size="sm" className="px-2 py-2">
                  보기
                </Button>
              </View>
            ))}
          </Card>

          <Card className="gap-2 bg-bg-2 px-5 py-4">
            <Text variant="meta" tone="ink">
              본인인증 전 확인
            </Text>
            <Text variant="caption" tone="ink-3" className="leading-5">
              계속하면 PortOne 본인인증으로 이동합니다.
            </Text>
          </Card>
        </View>
      </ScrollView>

      <View className="border-t border-line bg-bg px-6 pb-5 pt-3">
        <Button
          fullWidth
          disabled={!requiredAccepted}
          onPress={() => router.push(ROUTES.verify)}
          testID="terms-continue"
        >
          동의하고 본인인증 시작
        </Button>
      </View>
    </SafeAreaView>
  );
}

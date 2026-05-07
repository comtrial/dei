import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

const TERMS_DETAIL = {
  age: {
    body: [
      'Dei는 중복 가입과 계정 도용을 줄이기 위해 PortOne 본인확인 결과를 서버에서 재확인합니다.',
      '본인확인으로 전달된 휴대폰 번호와 개인식별정보는 해시 처리해 계정 식별과 안전 정책 집행에만 사용합니다.',
      '성인인증은 MVP 범위에서 제외하며, 정식 정책 확정 시 별도 고지 후 반영합니다.',
    ],
    title: '본인확인 및 연령 정책',
  },
  community: {
    body: [
      'Dei는 실제 일상을 기반으로 연결되는 서비스입니다.',
      '타인을 사칭하거나 허위 정보로 가입할 수 없고, 신고·차단 기준을 위반한 계정은 운영자 조치를 받을 수 있습니다.',
      '본인확인 정보는 중복 가입과 도용을 막기 위한 안전 장치로만 사용합니다.',
    ],
    title: '커뮤니티 가이드라인',
  },
  marketing: {
    body: [
      '마케팅 수신 동의는 선택 항목입니다.',
      '동의하면 이벤트, 기능 업데이트, 매칭 관련 안내를 받을 수 있습니다.',
      '정식 약관 확정 전까지 이 문구는 임시 안내문으로 사용합니다.',
    ],
    title: '마케팅 수신 동의',
  },
  privacy: {
    body: [
      'Dei는 가입과 본인인증, 매칭, 신고/차단, 결제 처리를 위해 필요한 정보를 처리합니다.',
      '휴대폰 번호와 본인인증 결과는 계정 식별과 안전한 이용자 확인을 위해 사용됩니다.',
      '정식 개인정보 처리방침 문서는 법무 검토 후 이 화면에 반영합니다.',
    ],
    title: '개인정보 처리방침',
  },
  service: {
    body: [
      '본 약관은 Dei 모바일 서비스 이용 조건과 이용자, 회사의 권리와 의무를 정합니다.',
      '이용자는 타인의 권리를 침해하거나 허위 정보로 가입할 수 없습니다.',
      '신고, 차단, 관리자 조치 기준은 안전한 매칭 환경을 위해 적용됩니다.',
    ],
    title: '서비스 이용약관',
  },
} as const;

type TermsDetailKey = keyof typeof TERMS_DETAIL;

export default function TermsDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = (params.type ?? 'service') as TermsDetailKey;
  const detail = TERMS_DETAIL[type] ?? TERMS_DETAIL.service;

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        contentContainerClassName="px-7 pb-10 pt-10"
        showsVerticalScrollIndicator={false}>
        <Pressable className="mb-6" onPress={() => router.back()}>
          <Text className="text-muted-foreground text-2xl">← TERMS DETAIL</Text>
        </Pressable>

        <Text className="text-3xl font-semibold leading-tight">{detail.title}</Text>
        <View className="bg-border my-8 h-px" />

        <View className="gap-7">
          {detail.body.map((paragraph, index) => (
            <View className="gap-3" key={paragraph}>
              <Text className="text-muted-foreground text-base font-semibold">
                제{index + 1}조
              </Text>
              <Text className="text-muted-foreground text-lg leading-8">{paragraph}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, POLICY } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  ChoiceList,
  SlideToConfirm,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { WITHDRAW_REASONS } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';

export default function WithdrawScreen() {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.withdraw_screen_entered);
  }, []);

  const canRequest = !!reason && (reason !== 'other' || detail.trim().length > 0);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="회원 탈퇴" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[22px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            정말 dei를 떠나실까요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            계정과 결제 기록을 함께 확인해야 해서 탈퇴 전 마지막 확인이 필요해요.
          </Text>

          <Banner tone="danger" icon="!" title="삭제 정책">
            계정 삭제 요청 시 영상은 {POLICY.video.purgeOnAccountDeletionHours}시간 안에 정리되어야 합니다.
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
        <SlideToConfirm
          disabled={!canRequest}
          label="길게 눌러 탈퇴 요청"
          onConfirm={() => setConfirmed(true)}
          className={!canRequest ? 'opacity-40' : undefined}
        />
      </BottomActionBar>

      <AlertDialog
        visible={confirmed}
        tone="info"
        icon="i"
        title="탈퇴 요청은 고객센터에서 도와드릴게요"
        description="계정 삭제와 환불 여부를 함께 확인해야 해서 상담으로 이어집니다."
        actions={[
          { label: '고객센터로 이동', variant: 'ink', onPress: () => router.replace(ROUTES.support) },
          { label: '홈으로', variant: 'secondary', onPress: () => router.replace(ROUTES.home) },
        ]}
        onDismiss={() => router.replace(ROUTES.home)}
      />
    </SafeAreaView>
  );
}

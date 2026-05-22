import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Text } from '@/components/ui/text';
import { useAccountGate } from '@/providers/account-gate-provider';

export default function DiscoveryScreen() {
  const { eligibility } = useAccountGate();

  return (
    <Screen
      eyebrow="Discover"
      title="오늘의 2초 프로필"
      description="본인 확인과 첫 영상 촬영을 마치면 입장합니다. 영상 검수를 통과하면 다른 사람의 추천에 노출됩니다.">
      <View className="gap-6">
        <View>
          <StatusRow
            label="본인 확인"
            tone={eligibility?.identity_verified ? 'success' : 'warning'}
            value={eligibility?.identity_verified ? '완료' : '대기'}
          />
          <StatusRow
            label="영상 검수"
            tone={eligibility?.first_video_approved ? 'success' : 'warning'}
            value={eligibility?.first_video_approved ? '통과' : '검수 중'}
          />
        </View>

        <View className="border-border min-h-80 items-center justify-center rounded-md border p-6">
          <Text className="text-center text-lg font-semibold">매칭 카드 영역</Text>
          <Text className="text-muted-foreground mt-2 text-center leading-6">
            다음 단계에서 승인된 유저 후보와 좋아요/패스를 연결합니다.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

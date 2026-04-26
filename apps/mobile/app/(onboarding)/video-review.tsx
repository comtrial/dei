import { RefreshCw } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAccountGate } from '@/providers/account-gate-provider';

export default function VideoReviewScreen() {
  const { eligibility, refresh } = useAccountGate();

  return (
    <Screen
      eyebrow="Review"
      title="운영자 승인 대기 중입니다"
      description="승인이 끝나면 매칭 화면으로 자동 이동합니다. 거절되면 다시 업로드할 수 있게 안내합니다.">
      <View className="gap-6">
        <View>
          <StatusRow
            detail={eligibility?.latest_video_rejection_reason ?? undefined}
            label="최근 영상"
            tone={eligibility?.latest_video_status === 'approved' ? 'success' : 'warning'}
            value={eligibility?.latest_video_status ?? '대기'}
          />
          <StatusRow
            label="매칭 입장"
            tone={eligibility?.can_enter_discovery ? 'success' : 'warning'}
            value={eligibility?.can_enter_discovery ? '가능' : '대기'}
          />
        </View>

        <Button onPress={() => refresh()} variant="outline">
          <RefreshCw color="#0a7ea4" size={18} />
          <Text>상태 새로고침</Text>
        </Button>
      </View>
    </Screen>
  );
}

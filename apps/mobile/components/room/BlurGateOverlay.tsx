/**
 * BlurGateOverlay — 피드 블러 게이트 오버레이.
 *
 * `isOpen=false` 일 때 피드 위를 덮어 흐리게 표시 + 영상 업로드 CTA.
 * 실제 가시성은 RLS 가 차단, 이 컴포넌트는 UI 안내용.
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { BlurGateState } from '@/lib/rooms/blur-gate';

type Props = {
  state: BlurGateState;
  roomId: string;
};

export function BlurGateOverlay({ state, roomId }: Props) {
  const router = useRouter();

  if (state.kind === 'open') return null;

  const isFirst = state.kind === 'never-uploaded';

  return (
    <View
      testID="room-feed-blur-overlay"
      className="absolute inset-0 items-center justify-center bg-background/90 rounded-2xl px-6 gap-4">
      <Text className="text-xl font-semibold text-foreground text-center">
        {isFirst ? '첫 영상을 올려보세요' : '피드가 잠겼어요'}
      </Text>
      <Text className="text-sm text-muted-foreground text-center leading-relaxed">
        {isFirst
          ? '3초 영상을 올리면 다른 멤버들의 하루를 볼 수 있어요.'
          : '24시간이 지났어요. 새 영상을 올리면 피드가 다시 열려요.'}
      </Text>
      <Button
        testID="room-feed-blur-upload-cta"
        onPress={() => router.push(`/room/${roomId}/upload` as never)}>
        <Text>{isFirst ? '지금 올리기' : '영상 올리기'}</Text>
      </Button>
    </View>
  );
}

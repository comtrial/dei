/**
 * ActiveRoomCard — home.tsx 의 "현재 활성 방" 진입 카드.
 *
 * 본인이 이미 active member 인 방이 있으면 홈 최상단에 표시 → 방으로 진입.
 * 그림 A 의 "매칭 완료 → 푸시 알림" 후 첫 진입과 동일 라우트로 합쳐진다.
 */
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import type { RoomSummary } from '@/lib/rooms/types';

const MS_IN_HOUR = 60 * 60 * 1000;

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '곧 종료';
  const hours = Math.floor(ms / MS_IN_HOUR);
  if (hours >= 24) return `${Math.floor(hours / 24)}일 남음`;
  if (hours >= 1) return `${hours}시간 남음`;
  return '1시간 이내';
}

export function ActiveRoomCard({ room }: { room: RoomSummary }) {
  const router = useRouter();
  const remaining = formatRemaining(room.expiresAt);

  return (
    <Pressable
      testID="home-active-room-card"
      onPress={() => router.push(`${ROUTES.home}/../room/${room.id}` as never)}
      className="rounded-2xl border border-border bg-card p-5 active:opacity-80">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
          진행 중인 방
        </Text>
        <Text className="text-xs text-muted-foreground">{remaining}</Text>
      </View>
      <Text className="text-lg font-semibold text-foreground mb-1">
        방으로 들어가기
      </Text>
      <Text className="text-sm text-muted-foreground">
        {room.activeMemberCount}명이 함께하고 있어요. 3초 영상을 올리고 친구들의 하루를 확인해보세요.
      </Text>
    </Pressable>
  );
}

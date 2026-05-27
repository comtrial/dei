/**
 * LeaveConfirmScreen — 방 나가기 확인 화면 (그림 A "방 나가기?").
 *
 * LeaveRoomDialog 를 풀스크린으로 표시 + leaveRoom Edge Function 호출.
 * 확인 시 홈으로 복귀 (24h cooldown 상태 카드가 홈에서 표시됨).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { logger } from '@dei/shared';
import { leaveRoom } from '@/lib/rooms/rooms-service';

export default function LeaveConfirmScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLeave = useCallback(async () => {
    if (!roomId) return;
    setLeaving(true);
    setErrorMsg(null);
    try {
      await leaveRoom(roomId);
      // 홈으로 복귀 — RematchCooldownCard 자동 표시
      router.replace('/home' as never);
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'rooms', screen: 'leave-confirm', action: 'leave' },
        extra: { roomId },
      });
      setErrorMsg('나가기에 실패했어요. 잠시 후 다시 시도해 주세요.');
      setLeaving(false);
    }
  }, [roomId, router]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-5 py-6 justify-between">
        {/* 안내 */}
        <View className="gap-4 mt-8">
          <Text className="text-2xl font-semibold text-foreground">방을 나갈까요?</Text>
          <Text className="text-sm text-muted-foreground leading-relaxed">
            방을 나가면 24시간 동안 새로운 방에 참여할 수 없어요.{'\n\n'}
            부스터를 사용하면 24시간 제한을 즉시 해제하고 다시 매칭에 참여할 수 있어요.{'\n\n'}
            이 방에서 나누었던 대화와 영상은 방 종료 후에도 30일간 보관돼요.
          </Text>

          {errorMsg && (
            <View className="rounded-xl bg-destructive/10 p-4">
              <Text className="text-sm text-destructive">{errorMsg}</Text>
            </View>
          )}
        </View>

        {/* 버튼 */}
        <View className="gap-3">
          <Button
            testID="room-leave-confirm-button"
            variant="destructive"
            onPress={handleLeave}
            disabled={leaving}>
            <Text>{leaving ? '나가는 중…' : '방 나가기'}</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => router.back()}
            disabled={leaving}>
            <Text>취소</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

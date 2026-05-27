/**
 * SoloJoinScreen — 혼자 참여 확인 화면.
 *
 * 홈(자유 상태)에서 "혼자 참여하기" CTA → 이 화면.
 * 확인 시:
 *   1) `createGroup([])` → size=1 묶음 생성 (빈 배열, Phase 3C-2 마이그레이션으로 허용)
 *   2) `enqueueGroupForMatch(groupId)` → 매칭 큐 등록
 *   3) 홈으로 돌아감 → MatchWaitingCard 가 자동 표시
 *
 * solo → queued group → 매칭 성사 → activeRoom 의 전체 흐름.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { logger } from '@dei/shared';
import {
  createGroup,
  enqueueGroupForMatch,
} from '@/lib/group/groups-service';

type Step = 'idle' | 'creating' | 'enqueuing' | 'error';

export default function SoloJoinScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setStep('creating');
    setErrorMsg(null);

    let groupId: string;
    try {
      const res = await createGroup([]);
      groupId = res.groupId;
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'group', screen: 'solo-join', action: 'create' },
      });
      setStep('error');
      setErrorMsg('묶음 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setStep('enqueuing');
    try {
      await enqueueGroupForMatch(groupId);
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'group', screen: 'solo-join', action: 'enqueue' },
      });
      setStep('error');
      setErrorMsg('매칭 큐 등록에 실패했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // 홈으로 복귀 → useMyForming 갱신으로 MatchWaitingCard 자동 표시
    router.back();
  }, [router]);

  const busy = step === 'creating' || step === 'enqueuing';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-5 py-6 justify-between">
        {/* 상단 설명 */}
        <View className="gap-4">
          <Text className="text-2xl font-semibold text-foreground">혼자 참여하기</Text>
          <Text className="text-sm text-muted-foreground leading-relaxed">
            개인 큐에 등록하면 비슷한 시간대에 매칭을 기다리는 다른 그룹과 연결돼요.{'\n\n'}
            매칭이 완료되면 푸시 알림을 보내드려요.{'\n\n'}
            방에 입장하면 7일 동안 함께하는 멤버들과 매일 3초 영상을 공유할 수 있어요.
          </Text>

          {step === 'error' && errorMsg ? (
            <View className="rounded-xl bg-destructive/10 p-4">
              <Text className="text-sm text-destructive">{errorMsg}</Text>
            </View>
          ) : null}

          {busy ? (
            <View className="rounded-xl bg-muted/40 p-4">
              <Text className="text-sm text-muted-foreground">
                {step === 'creating' ? '묶음을 만드는 중이에요…' : '매칭 큐에 등록 중이에요…'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 하단 CTA */}
        <View className="gap-3">
          <Button
            testID="solo-join-confirm"
            onPress={handleConfirm}
            disabled={busy}>
            <Text>{busy ? '처리 중…' : '매칭 시작하기'}</Text>
          </Button>
          <Button
            testID="solo-join-cancel"
            variant="ghost"
            onPress={() => router.back()}
            disabled={busy}>
            <Text>취소</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * GroupDetailScreen — 묶음 상태 화면.
 *
 * `group/new.tsx` 에서 생성 후 자동 진입, 또는 홈의 MatchWaitingCard 에서 진입.
 * 흐름:
 *   - `useGroup(groupId)` 로 멤버 가용성 실시간 확인
 *   - 모든 멤버 isInActiveRoom = false 이면 "매칭 시작" 활성화
 *   - "매칭 시작" → `enqueueGroupForMatch(groupId)` → 홈으로 복귀 (MatchWaitingCard)
 *   - "해체" → `disbandGroup(groupId)` → 홈으로 복귀
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupMemberList } from '@/components/group/GroupMemberList';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { logger } from '@dei/shared';
import { useGroup } from '@/hooks/useGroup';
import { disbandGroup, enqueueGroupForMatch } from '@/lib/group/groups-service';

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();

  const { group, members, busyMembers, canEnqueue, loading, refresh } = useGroup(groupId);

  const [enqueuing, setEnqueuing] = useState(false);
  const [disbanding, setDisbanding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEnqueue = useCallback(async () => {
    if (!groupId) return;
    setEnqueuing(true);
    setErrorMsg(null);
    try {
      await enqueueGroupForMatch(groupId);
      // 홈으로 복귀 → useMyForming 갱신으로 MatchWaitingCard 자동 표시
      router.back();
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'group', screen: 'group-detail', action: 'enqueue' },
        extra: { groupId },
      });
      setErrorMsg('매칭 등록에 실패했어요. 잠시 후 다시 시도해 주세요.');
      setEnqueuing(false);
    }
  }, [groupId, router]);

  const handleDisband = useCallback(async () => {
    if (!groupId) return;
    setDisbanding(true);
    setErrorMsg(null);
    try {
      await disbandGroup(groupId);
      router.back();
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'group', screen: 'group-detail', action: 'disband' },
        extra: { groupId },
      });
      setErrorMsg('묶음 해체에 실패했어요. 잠시 후 다시 시도해 주세요.');
      setDisbanding(false);
    }
  }, [groupId, router]);

  const busy = enqueuing || disbanding;
  const isQueued = group?.status === 'queued';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-5 py-6 gap-5"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        {/* 헤더 */}
        <View>
          <Text className="text-2xl font-semibold text-foreground mb-1">우리 묶음</Text>
          {isQueued ? (
            <Text className="text-sm text-primary font-semibold">매칭 대기 중</Text>
          ) : (
            <Text className="text-sm text-muted-foreground">
              멤버들의 상태를 확인하고 매칭을 시작해보세요.
            </Text>
          )}
        </View>

        {/* 멤버 리스트 */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            멤버 ({members.length}명)
          </Text>
          {loading && members.length === 0 ? (
            <Text className="text-sm text-muted-foreground py-2">불러오는 중…</Text>
          ) : (
            <GroupMemberList
              members={members.map((m) => ({
                userId: m.profileId,
                nickname: m.nickname,
                isInActiveRoom: m.isInActiveRoom,
              }))}
            />
          )}
        </View>

        {/* 바쁜 멤버 안내 */}
        {busyMembers.length > 0 && !isQueued ? (
          <View className="rounded-xl bg-muted/40 p-4">
            <Text className="text-sm text-muted-foreground">
              {busyMembers.length}명이 현재 다른 방에 있어요. 모든 멤버가 가용 상태여야 매칭을 시작할 수 있어요.
            </Text>
          </View>
        ) : null}

        {/* 에러 메시지 */}
        {errorMsg ? (
          <View className="rounded-xl bg-destructive/10 p-4">
            <Text className="text-sm text-destructive">{errorMsg}</Text>
          </View>
        ) : null}

        {/* 액션 버튼 */}
        {!isQueued ? (
          <View className="gap-3">
            <Button
              testID="group-detail-enqueue"
              onPress={handleEnqueue}
              disabled={!canEnqueue || busy}>
              <Text>
                {enqueuing
                  ? '등록 중…'
                  : !canEnqueue && busyMembers.length > 0
                    ? '멤버가 준비되지 않았어요'
                    : '매칭 시작하기'}
              </Text>
            </Button>
            <Button
              testID="group-detail-disband"
              variant="ghost"
              onPress={handleDisband}
              disabled={busy}>
              <Text className="text-destructive">{disbanding ? '해체 중…' : '묶음 해체'}</Text>
            </Button>
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-card p-5">
            <Text className="text-sm font-semibold text-primary mb-1">매칭 대기 중</Text>
            <Text className="text-sm text-muted-foreground">
              매칭이 완료되면 푸시 알림을 드려요. 잠시만 기다려 주세요.
            </Text>
          </View>
        )}

        <Button
          testID="group-detail-back"
          variant="ghost"
          onPress={() => router.back()}
          disabled={busy}>
          <Text>홈으로 돌아가기</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

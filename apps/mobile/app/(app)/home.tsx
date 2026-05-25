/**
 * Home — rooms-pivot 의 진입 허브.
 *
 * 단일 상태 분기:
 *   1) 활성 방 있음 → ActiveRoomCard (방으로 진입)
 *   2) 매칭 큐 (forming/queued group 의 leader) → MatchWaitingCard
 *   3) 24h cooldown 활성 → RematchCooldownCard (+ 부스터 CTA)
 *   4) 자유 상태 → "혼자 참여" / "함께(과팅) 참여" CTA
 *
 * Phase 1 의 placeholder 를 대체. 그림 A 의 "가입 / 홈 (매칭 대기)" 노드.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveRoomCard } from '@/components/home/ActiveRoomCard';
import { MatchWaitingCard } from '@/components/home/MatchWaitingCard';
import { RematchCooldownCard } from '@/components/home/RematchCooldownCard';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useBoosterPurchase } from '@/hooks/useBoosterPurchase';
import { useMyForming } from '@/hooks/useGroup';
import { useMatchQueue } from '@/hooks/useMatchQueue';
import { useRematchCooldown } from '@/hooks/useRematchCooldown';
import { disbandGroup } from '@/lib/group/groups-service';
import { fetchMyActiveRoom } from '@/lib/rooms/rooms-service';
import type { RoomSummary } from '@/lib/rooms/types';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);

  const { group, refresh: refreshGroup } = useMyForming();
  const { state: queueState } = useMatchQueue(group?.id ?? null);
  const { state: cooldown, refresh: refreshCooldown } = useRematchCooldown();
  const { step, purchaseAndConsume } = useBoosterPurchase();

  const refreshActiveRoom = useCallback(async () => {
    setActiveLoading(true);
    const next = await fetchMyActiveRoom();
    setActiveRoom(next);
    setActiveLoading(false);
  }, []);

  useEffect(() => {
    void refreshActiveRoom();
  }, [refreshActiveRoom, user?.id]);

  // 매칭 성사 → 자동으로 방으로 라우팅
  useEffect(() => {
    if (queueState.matched) {
      void refreshActiveRoom().then(() => {
        void refreshGroup();
      });
    }
  }, [queueState.matched, refreshActiveRoom, refreshGroup]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshActiveRoom(), refreshGroup(), refreshCooldown()]);
  }, [refreshActiveRoom, refreshGroup, refreshCooldown]);

  const onUseBooster = useCallback(async () => {
    const result = await purchaseAndConsume();
    if (result.ok) {
      await Promise.all([refreshCooldown(), refreshActiveRoom()]);
    }
  }, [purchaseAndConsume, refreshActiveRoom, refreshCooldown]);

  const handleCancelQueue = useCallback(async () => {
    if (!group) return;
    try {
      await disbandGroup(group.id);
    } catch {
      /* silently ignore — refresh below will reflect real state */
    }
    await refreshGroup();
  }, [group, refreshGroup]);

  const isBusy = step !== 'idle' && step !== 'done' && step !== 'error';

  // 분기 (우선순위 순):
  // 1) active room  → 그림 A "매칭 후 첫 진입" 자리
  // 2) queued group → 매칭 대기
  // 3) cooldown active → 부스터/대기
  // 4) 자유 상태   → 참여 선택
  const showActive = Boolean(activeRoom && activeRoom.status === 'active');
  const showWaiting =
    !showActive && Boolean(group && (group.status === 'forming' || group.status === 'queued'));
  const showCooldown =
    !showActive && !showWaiting && Boolean(cooldown.cooldownUntil && cooldown.remainingMs > 0);
  const showFree = !showActive && !showWaiting && !showCooldown;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-5 py-6 gap-4"
        refreshControl={
          <RefreshControl refreshing={activeLoading} onRefresh={onRefresh} />
        }>
        <View>
          <Text className="text-2xl font-semibold text-foreground mb-1">홈</Text>
          <Text className="text-sm text-muted-foreground">
            오늘은 어떤 만남을 만들어볼까요?
          </Text>
        </View>

        {showActive && activeRoom ? <ActiveRoomCard room={activeRoom} /> : null}

        {showWaiting && group ? (
          <MatchWaitingCard
            groupSize={group.size}
            enqueuedAt={queueState.enqueuedAt}
            onCancel={group.status === 'forming' ? handleCancelQueue : undefined}
          />
        ) : null}

        {showCooldown ? (
          <RematchCooldownCard
            remainingMs={cooldown.remainingMs}
            availableBoosters={cooldown.availableBoosters}
            isFemale={false /* TODO: provider 의 profile gender 캐시 도입 시 교체 */}
            onUseBooster={onUseBooster}
            busy={isBusy}
          />
        ) : null}

        {showFree ? (
          <View className="gap-3">
            <Pressable
              testID="home-solo-join-cta"
              onPress={() => router.push('/solo-join' as never)}
              className="rounded-2xl border border-border bg-card p-5 active:opacity-80">
              <Text className="text-lg font-semibold text-foreground mb-1">
                혼자 참여하기
              </Text>
              <Text className="text-sm text-muted-foreground">
                개인 큐에 등록하고 비슷한 시간을 공유하는 사람들과 매칭돼요.
              </Text>
            </Pressable>

            <Pressable
              testID="home-group-new-cta"
              onPress={() => router.push('/group/new' as never)}
              className="rounded-2xl border border-border bg-card p-5 active:opacity-80">
              <Text className="text-lg font-semibold text-foreground mb-1">
                친구들과 과팅하기
              </Text>
              <Text className="text-sm text-muted-foreground">
                닉네임으로 친구를 초대해 묶음으로 매칭을 진행해요.
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* 결제 진행 중 사용자 안내 (전역 토스트 대신 카드 하단) */}
        {isBusy ? (
          <View className="rounded-xl bg-muted/40 p-3">
            <Text className="text-xs text-muted-foreground">
              {step === 'granting-free'
                ? '무료 부스터를 발급 중이에요…'
                : step === 'purchasing'
                  ? '결제를 진행 중이에요…'
                  : step === 'syncing'
                    ? '영수증을 동기화 중이에요…'
                    : step === 'consuming'
                      ? '재매칭 제한을 푸는 중이에요…'
                      : '처리 중…'}
            </Text>
          </View>
        ) : null}

        {step === 'error' ? (
          <View className="rounded-xl bg-destructive/10 p-3">
            <Text className="text-xs text-destructive">
              부스터 처리에 실패했어요. 잠시 후 다시 시도해 주세요.
            </Text>
          </View>
        ) : null}

        <Button
          testID="home-debug-refresh"
          variant="ghost"
          onPress={onRefresh}
          className="self-center mt-2">
          <Text>새로고침</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

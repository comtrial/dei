/**
 * RoomFeedScreen — 방 분할 피드 메인화면 (그림 A "공유 화면").
 *
 * 상태:
 *   1) 블러 게이트 활성 → BlurGateOverlay 표시 (피드는 렌더하되 덮어씌움)
 *   2) 피드 열림 → RoomFeedGrid (2×N)
 *   3) 방 종료/만료 → 안내 + 홈 복귀
 *
 * 탭 네비게이션 없이 스택 뷰 — 우상단 메뉴로 채팅/멤버/업로드/나가기 진입.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlurGateOverlay } from '@/components/room/BlurGateOverlay';
import { HourlyUploadButton } from '@/components/room/HourlyUploadButton';
import { RoomFeedGrid } from '@/components/room/RoomFeedGrid';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useBlurGate } from '@/hooks/useBlurGate';
import { useRoom } from '@/hooks/useRoom';
import { useRoomFeed } from '@/hooks/useRoomFeed';
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { useAuth } from '@/providers/auth-provider';

export default function RoomFeedScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const { room, loading: roomLoading } = useRoom(roomId);
  const { cells, loading: feedLoading, refresh: refreshFeed } = useRoomFeed(roomId);
  const { members, loading: membersLoading, refresh: refreshMembers } = useRoomMembers(roomId);
  const { state: blurState, loading: blurLoading } = useBlurGate(roomId, user?.id);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshFeed(), refreshMembers()]);
    setRefreshing(false);
  }, [refreshFeed, refreshMembers]);

  // 이번 시간 슬롯에 내가 업로드했는지
  const nowKstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  const nowKstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const alreadyUploadedThisSlot = cells.some(
    (c) =>
      c.profileId === user?.id &&
      c.hourSlot === nowKstHour &&
      c.slotDate === nowKstDate,
  );

  const isLoading = roomLoading || feedLoading || membersLoading || blurLoading;

  if (!isLoading && (!room || room.status !== 'active')) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text className="text-lg font-semibold text-foreground text-center">방이 종료됐어요</Text>
        <Text className="text-sm text-muted-foreground text-center">
          이 방은 더 이상 활성 상태가 아니에요.
        </Text>
        <Button onPress={() => router.replace('/home' as never)}>
          <Text>홈으로</Text>
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* 헤더 */}
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-border">
        <Text className="text-lg font-semibold text-foreground">방</Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => router.push(`/room/${roomId}/chat` as never)}
            className="px-3 py-1.5 rounded-lg bg-muted active:opacity-70">
            <Text className="text-sm">채팅</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/room/${roomId}/members` as never)}
            className="px-3 py-1.5 rounded-lg bg-muted active:opacity-70">
            <Text className="text-sm">멤버</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/room/${roomId}/leave-confirm` as never)}
            className="px-3 py-1.5 rounded-lg active:opacity-70">
            <Text className="text-sm text-muted-foreground">나가기</Text>
          </Pressable>
        </View>
      </View>

      {/* 피드 */}
      <View className="flex-1" style={{ position: 'relative' }}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <RoomFeedGrid
            cells={cells}
            members={members}
            myProfileId={user?.id}
          />
        </ScrollView>

        {/* 블러 오버레이 */}
        {!blurLoading && blurState.kind !== 'open' && roomId ? (
          <BlurGateOverlay state={blurState} roomId={roomId} />
        ) : null}

        {/* 업로드 FAB */}
        <View className="absolute bottom-6 right-6">
          {roomId ? (
            <HourlyUploadButton
              roomId={roomId}
              alreadyUploadedThisSlot={alreadyUploadedThisSlot}
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

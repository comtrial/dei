/**
 * CH1 · 채팅 목록 (홈 탭바 "DM"/"채팅" 진입).
 * conversations updated_at desc. 행 tap → CH0 라우터.
 * 0건 → CH3 빈 상태 ("일상 로그 기록하기" → R3 촬영).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { ChatListRow } from '@/components/chat/ChatListRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useChatList } from '@/hooks/useChatList';
import type { ChatListItem } from '@/lib/chat/types';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, loading, error, reload } = useChatList(user?.id ?? null);

  // 채팅방에서 나가기 / 메시지 전송 후 복귀 시 목록 최신화.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleOpen = useCallback(
    (item: ChatListItem) => {
      logger.addBreadcrumb({
        message: 'chat_list_item_tapped',
        category: 'chat',
        data: { conversationId: item.conversationId },
      });
      // CH0 라우터로 — 진입점에서 conversation_id 해석 후 게이트 판정.
      router.push({
        pathname: ROUTES.chatRoute,
        params: { conversationId: item.conversationId, source: 'list' },
      });
    },
    [router],
  );

  // 10-I: CH3 빈 상태 "일상 로그 기록하기" → R3 촬영 (cross-WF).
  // FULL-spec: [CH3]chat_empty_state_record_tapped → CHANGE_LOCAL_UI_STATE
  // → CTX[R3] 로그 촬영 화면. R3 = ROUTES.record (/record).
  const handleRecord = useCallback(() => {
    logger.addBreadcrumb({
      message: 'chat_empty_state_record_tapped',
      category: 'chat',
    });
    router.push(ROUTES.record);
  }, [router]);

  if (loading) {
    return (
      <Screen eyebrow="DM" title="매칭된 사람과만 대화합니다">
        <View className="min-h-80 items-center justify-center" testID="chat-list-loading">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  // 로드 실패 → 에러 상태(재시도 가능). 네트워크 실패를 "매칭 없음"(CH3)
  // 으로 오표시하지 않는다 (PM 검증서 P1-5). CH3 는 스펙상 "매칭 0건 또는
  // 모든 대화 양쪽 삭제" 일 때만.
  if (error) {
    return (
      <Screen eyebrow="DM" title="매칭된 사람과만 대화합니다">
        <View
          className="border-border min-h-80 flex-1 items-center justify-center gap-5 rounded-md border p-6"
          testID="chat-list-error">
          <View className="items-center gap-2">
            <Text className="text-center text-lg font-semibold">
              목록을 불러오지 못했어요
            </Text>
            <Text className="text-muted-foreground text-center leading-6">
              네트워크 상태를 확인하고 다시 시도해 주세요.
            </Text>
          </View>
          <Button
            accessibilityLabel="다시 시도"
            onPress={reload}
            testID="chat-list-retry">
            <Text>다시 시도</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  // CH3: 매칭 0건 (또는 모든 대화 양쪽 삭제로 0건) → 빈 상태.
  if (items.length === 0) {
    return (
      <Screen eyebrow="DM" title="매칭된 사람과만 대화합니다">
        <ChatEmptyState onRecord={handleRecord} />
      </Screen>
    );
  }

  return (
    <Screen eyebrow="DM" title="매칭된 사람과만 대화합니다">
      <View testID="chat-list">
        {items.map((item) => (
          <ChatListRow key={item.conversationId} item={item} onPress={handleOpen} />
        ))}
      </View>
    </Screen>
  );
}

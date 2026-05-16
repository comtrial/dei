/**
 * LK8 · 매칭 화면 (매칭된 사람들).
 *
 * 매칭 로직 본체는 다른 워크플로(매칭) 소관이지만, **매칭 완료 지점에서
 * 채팅 funnel 로 넘기는 연결**(스펙 user_flow "09 매칭 완료 → 채팅 진입" /
 * "10-A 매칭 직후 채팅 진입 e2e (LK8)")은 이 화면이 책임진다. 각 매칭 행의
 * "채팅하기" 콜백이 `enterChatFromMatch` 를 통해 CH0 라우터(`/chat`)를
 * 호출한다 — CH0 가 차단/상태 게이트를 최종 판정.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { enterChatFromMatch } from '@/lib/chat/enter-chat';
import { useMatches } from '@/hooks/useMatches';
import { logger } from '@dei/shared';

export default function MatchesScreen() {
  const router = useRouter();
  const { matches, loading } = useMatches();

  const handleChat = useCallback(
    (conversationId: string | null) => {
      logger.addBreadcrumb({
        message: 'lk8_match_chat_tapped',
        category: 'chat',
        data: { conversationId, source: 'lk8' },
      });
      const routed = enterChatFromMatch(
        (target) => router.push(target),
        { conversationId, source: 'lk8' },
      );
      if (!routed) {
        // conversation 미발급 — funnel 비차단 안전 degrade.
        logger.addBreadcrumb({
          message: 'lk8_match_chat_no_conversation',
          category: 'chat',
        });
      }
    },
    [router],
  );

  return (
    <Screen eyebrow="Matches" title="서로 좋아요를 보낸 사람들">
      {loading ? (
        <View
          className="border-border min-h-80 items-center justify-center rounded-md border p-6"
          testID="matches-loading">
          <Text className="text-muted-foreground">불러오는 중…</Text>
        </View>
      ) : matches.length === 0 ? (
        <View
          className="border-border min-h-80 items-center justify-center rounded-md border p-6"
          testID="matches-empty">
          <Text className="text-center text-lg font-semibold">아직 매칭이 없습니다</Text>
          <Text className="text-muted-foreground mt-2 text-center leading-6">
            서로 좋아요를 보내면 여기에서 바로 대화를 시작할 수 있어요.
          </Text>
        </View>
      ) : (
        <View testID="matches-list">
          {matches.map((m) => (
            <View
              key={m.matchId}
              className="border-border mb-3 flex-row items-center justify-between rounded-md border p-4"
              testID={`matches-row-${m.matchId}`}>
              <View className="flex-row items-center gap-3">
                <View className="bg-secondary h-10 w-10 items-center justify-center rounded-full">
                  <Text className="text-secondary-foreground font-semibold">
                    {m.nickname.charAt(0) || '?'}
                  </Text>
                </View>
                <Text className="text-base font-semibold">{m.nickname}</Text>
              </View>
              <Button
                accessibilityLabel={`${m.nickname}님과 채팅하기`}
                onPress={() => handleChat(m.conversationId)}
                testID={`matches-chat-${m.matchId}`}>
                <Text>채팅하기</Text>
              </Button>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

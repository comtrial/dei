/**
 * CH3 · 채팅 목록 빈 상태.
 * 매칭 0건 또는 모든 대화가 양쪽 삭제됨.
 * "아직 매칭이 없어요 — 일상 로그 기록하기" CTA → R3 cross-WF (촬영).
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type ChatEmptyStateProps = {
  onRecord: () => void;
};

export function ChatEmptyState({ onRecord }: ChatEmptyStateProps) {
  return (
    <View
      className="border-border min-h-80 flex-1 items-center justify-center gap-5 rounded-md border p-6"
      testID="chat-empty-state">
      <View className="items-center gap-2">
        <Text className="text-center text-lg font-semibold">아직 매칭이 없어요</Text>
        <Text className="text-muted-foreground text-center leading-6">
          일상 로그를 남기면 더 많은 사람과 매칭될 수 있어요.
        </Text>
      </View>
      <Button
        accessibilityLabel="일상 로그 기록하기"
        onPress={onRecord}
        testID="chat-empty-record">
        <Text>일상 로그 기록하기</Text>
      </Button>
    </View>
  );
}

/**
 * CH1 목록의 한 행. 상대 닉네임 + 마지막 메시지 미리보기 + updated_at.
 * tap → CH0 라우터.
 */
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ChatListItem } from '@/lib/chat/types';

type ChatListRowProps = {
  item: ChatListItem;
  onPress: (item: ChatListItem) => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function ChatListRow({ item, onPress }: ChatListRowProps) {
  const initial = item.otherNickname.trim().charAt(0) || '?';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.otherNickname}와의 대화`}
      className="flex-row items-center gap-3 px-1 py-4 active:bg-accent rounded-md"
      onPress={() => onPress(item)}
      testID={`chat-list-row-${item.conversationId}`}>
      <View className="bg-secondary h-12 w-12 items-center justify-center rounded-full">
        <Text className="text-secondary-foreground text-lg font-semibold">{initial}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold" numberOfLines={1}>
            {item.otherNickname}
          </Text>
          <Text className="text-muted-foreground ml-2 text-xs">
            {formatWhen(item.updatedAt)}
          </Text>
        </View>
        <Text className="text-muted-foreground mt-0.5 text-sm" numberOfLines={1}>
          {item.lastMessagePreview ?? '아직 메시지가 없어요'}
        </Text>
      </View>
    </Pressable>
  );
}

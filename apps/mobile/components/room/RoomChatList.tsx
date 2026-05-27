/**
 * RoomChatList — 방 채팅 메시지 목록 (역순, 최신이 아래).
 *
 * optimistic 메시지는 opacity 0.6 으로 표시.
 * failed 메시지는 빨간 테두리 + "재전송" 버튼.
 * @멘션 된 본인 이름은 primary 색으로 표시.
 */
import { FlatList, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ChatBubble } from '@/lib/rooms/types';

type Props = {
  messages: ChatBubble[];
  myProfileId: string | null | undefined;
  onRetry?: (tempId: string) => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function MessageBubble({
  bubble,
  isMe,
  onRetry,
}: {
  bubble: ChatBubble;
  isMe: boolean;
  onRetry?: (id: string) => void;
}) {
  const isFailed = bubble.status === 'failed';
  const isSending = bubble.isOptimistic && bubble.status === 'sending';

  return (
    <View
      className={['flex-row mb-2', isMe ? 'justify-end' : 'justify-start'].join(' ')}
      style={{ opacity: isSending ? 0.6 : 1 }}>
      <View
        className={[
          'max-w-[75%] rounded-2xl px-4 py-2',
          isMe ? 'bg-primary rounded-br-sm' : 'bg-card rounded-bl-sm',
          isFailed ? 'border border-destructive' : '',
        ].join(' ')}>
        <Text
          className={[
            'text-sm',
            isMe ? 'text-primary-foreground' : 'text-foreground',
          ].join(' ')}>
          {bubble.body}
        </Text>
        <View className="flex-row items-center justify-end gap-1 mt-0.5">
          <Text className={['text-xs opacity-60', isMe ? 'text-primary-foreground' : 'text-muted-foreground'].join(' ')}>
            {formatTime(bubble.createdAt)}
          </Text>
          {isFailed && (
            <Pressable onPress={() => onRetry?.(bubble.id)}>
              <Text className="text-xs text-destructive font-medium">재전송</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export function RoomChatList({ messages, myProfileId, onRetry }: Props) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      inverted
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
      renderItem={({ item }) => (
        <MessageBubble
          bubble={item}
          isMe={item.authorId === myProfileId}
          onRetry={onRetry}
        />
      )}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center py-12">
          <Text className="text-sm text-muted-foreground">아직 메시지가 없어요</Text>
        </View>
      }
    />
  );
}

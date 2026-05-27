/**
 * RoomChatScreen — 방 전체 채팅 (그림 A "전체 채팅 @멘션").
 *
 * useRoomChat(optimistic + retry + realtime) + useRoomMembers(멘션 자동완성).
 */
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoomChatComposer } from '@/components/room/RoomChatComposer';
import { RoomChatList } from '@/components/room/RoomChatList';
import { Text } from '@/components/ui/text';
import { useRoomChat } from '@/hooks/useRoomChat';
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { useAuth } from '@/providers/auth-provider';

export default function RoomChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

  const { messages, loading, sending, send, retry } = useRoomChat(roomId, user?.id);
  const { members } = useRoomMembers(roomId);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-1">
        {loading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm text-muted-foreground">불러오는 중…</Text>
          </View>
        ) : (
          <RoomChatList
            messages={messages}
            myProfileId={user?.id}
            onRetry={retry}
          />
        )}
      </View>

      <RoomChatComposer
        members={members}
        myProfileId={user?.id}
        sending={sending}
        onSend={(body) => { void send(body); }}
      />
    </SafeAreaView>
  );
}

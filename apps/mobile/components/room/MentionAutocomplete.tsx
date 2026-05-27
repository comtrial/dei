/**
 * MentionAutocomplete — `@` 입력 시 멤버 닉네임 자동완성 드롭다운.
 *
 * RoomChatComposer 가 `@` 감지 후 이 컴포넌트를 마운트.
 * 선택 시 `onSelect(nickname)` 콜백 호출.
 */
import { FlatList, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';

type Props = {
  prefix: string;                // '@' 뒤 현재 입력 중인 텍스트
  members: RoomMemberWithProfile[];
  myProfileId: string | null | undefined;
  onSelect: (nickname: string) => void;
};

export function MentionAutocomplete({ prefix, members, myProfileId, onSelect }: Props) {
  const filtered = members.filter(
    (m) =>
      m.profileId !== myProfileId &&
      m.status === 'active' &&
      m.nickname &&
      m.nickname.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  if (filtered.length === 0) return null;

  return (
    <View className="border border-border bg-card rounded-xl mx-4 mb-1 overflow-hidden shadow-md">
      <FlatList
        data={filtered.slice(0, 5)}
        keyExtractor={(item) => item.profileId}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.nickname!)}
            className="px-4 py-2.5 border-b border-border/40 active:bg-muted">
            <Text className="text-sm text-foreground">@{item.nickname}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

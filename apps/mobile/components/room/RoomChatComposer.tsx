/**
 * RoomChatComposer — 채팅 입력창 + @멘션 자동완성 트리거.
 *
 * `@` 를 입력하면 MentionAutocomplete 를 팝업.
 * 선택 시 현재 입력에 닉네임 삽입.
 */
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { MentionAutocomplete } from '@/components/room/MentionAutocomplete';
import { Text } from '@/components/ui/text';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';

type Props = {
  members: RoomMemberWithProfile[];
  myProfileId: string | null | undefined;
  sending: boolean;
  onSend: (body: string) => void;
};

export function RoomChatComposer({ members, myProfileId, sending, onSend }: Props) {
  const [text, setText] = useState('');
  const [mentionPrefix, setMentionPrefix] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleChange = useCallback((value: string) => {
    setText(value);
    // '@' 감지: 마지막 '@' 이후 글자만 추출
    const atIdx = value.lastIndexOf('@');
    if (atIdx !== -1) {
      const afterAt = value.slice(atIdx + 1);
      if (!afterAt.includes(' ') && afterAt.length <= 20) {
        setMentionPrefix(afterAt);
        return;
      }
    }
    setMentionPrefix(null);
  }, []);

  const handleSelectMention = useCallback(
    (nickname: string) => {
      const atIdx = text.lastIndexOf('@');
      const newText = text.slice(0, atIdx) + `@${nickname} `;
      setText(newText);
      setMentionPrefix(null);
      inputRef.current?.focus();
    },
    [text],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length < 1 || sending) return;
    onSend(trimmed);
    setText('');
    setMentionPrefix(null);
  }, [text, sending, onSend]);

  const canSend = text.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}>
      {mentionPrefix !== null && (
        <MentionAutocomplete
          prefix={mentionPrefix}
          members={members}
          myProfileId={myProfileId}
          onSelect={handleSelectMention}
        />
      )}
      <View className="flex-row items-end border-t border-border bg-background px-3 py-2 gap-2">
        <TextInput
          ref={inputRef}
          testID="room-chat-composer-input"
          value={text}
          onChangeText={handleChange}
          placeholder="메시지 입력..."
          placeholderTextColor="#9ca3af"
          multiline
          maxLength={500}
          className="flex-1 min-h-[40px] max-h-[120px] bg-muted rounded-2xl px-4 py-2 text-sm text-foreground"
        />
        <Pressable
          testID="room-chat-composer-send"
          onPress={handleSend}
          disabled={!canSend}
          className={[
            'w-10 h-10 rounded-full items-center justify-center',
            canSend ? 'bg-primary active:opacity-80' : 'bg-muted',
          ].join(' ')}>
          <Text className={canSend ? 'text-primary-foreground font-bold' : 'text-muted-foreground'}>
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

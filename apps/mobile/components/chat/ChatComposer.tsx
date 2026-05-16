/**
 * CH2 하단 컴포저.
 *   - multiline expand (max 5줄), grapheme cluster 1~500자
 *   - 카운터 (490자+ 빨강)
 *   - 전송 버튼 활성: 1~500자 / 비활성: 0자 또는 501+자
 */
import { SendHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  MESSAGE_MAX,
  evaluateComposer,
} from '@/lib/chat/message';
import { cn } from '@/lib/utils';

type ChatComposerProps = {
  disabled?: boolean;
  onSend: (body: string) => void;
};

export function ChatComposer({ disabled = false, onSend }: ChatComposerProps) {
  const [text, setText] = useState('');
  const composer = evaluateComposer(text);
  const showCounter = composer.length > 0;

  const handleSend = () => {
    if (disabled || !composer.canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View className="border-border bg-background border-t px-4 pb-6 pt-3" testID="chat-composer">
      <View className="flex-row items-end gap-2">
        <Input
          accessibilityLabel="메시지 입력"
          className="max-h-32 min-h-12 flex-1 py-3"
          editable={!disabled}
          multiline
          numberOfLines={5}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          testID="chat-composer-input"
          value={text}
        />
        <Pressable
          accessibilityLabel="메시지 전송"
          accessibilityRole="button"
          className={cn(
            'h-12 w-12 items-center justify-center rounded-md',
            composer.canSend && !disabled ? 'bg-primary' : 'bg-muted',
          )}
          disabled={disabled || !composer.canSend}
          onPress={handleSend}
          testID="chat-composer-send">
          <Icon
            as={SendHorizontal}
            className={
              composer.canSend && !disabled
                ? 'text-primary-foreground'
                : 'text-muted-foreground'
            }
            size={20}
          />
        </Pressable>
      </View>
      {showCounter ? (
        <Text
          className={cn(
            'mt-1 text-right text-xs',
            composer.isDanger ? 'text-destructive' : 'text-muted-foreground',
          )}
          testID="chat-composer-counter">
          {composer.length}/{MESSAGE_MAX}
        </Text>
      ) : null}
    </View>
  );
}

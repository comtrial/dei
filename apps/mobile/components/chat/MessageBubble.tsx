/**
 * CH2 메시지 버블. 내 메시지(우측, primary) / 상대(좌측, muted).
 * 전송 실패 시 ❗ 인라인 retry 마커 (10-E).
 */
import { AlertCircle } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ChatMessage } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

type MessageBubbleProps = {
  message: ChatMessage;
  isMine: boolean;
  onRetry: (clientId: string) => void;
};

export function MessageBubble({ message, isMine, onRetry }: MessageBubbleProps) {
  const failed = message.deliveryStatus === 'failed';
  const sending = message.deliveryStatus === 'sending';
  // 비재시도 실패(retryable===false)면 "다시 시도" 마커를 노출하지 않는다
  // (PM 검증서 P0-4). 버블 자체는 보통 useChatRoom 이 제거하지만, 어떤
  // 경로로든 failed=true 인데 retryable=false 면 마커를 숨겨 사용자 오인 방지.
  const showRetry = failed && message.retryable !== false;

  return (
    <View
      className={cn('mb-2 max-w-[78%]', isMine ? 'self-end items-end' : 'self-start items-start')}
      testID={`chat-bubble-${message.id}`}>
      <View
        className={cn(
          'rounded-2xl px-4 py-2.5',
          isMine ? 'bg-primary' : 'bg-muted',
          failed && 'opacity-60',
        )}>
        <Text className={cn('text-base leading-6', isMine ? 'text-primary-foreground' : 'text-foreground')}>
          {message.body}
        </Text>
      </View>

      {showRetry ? (
        <Pressable
          accessibilityLabel="전송 실패 — 다시 시도"
          accessibilityRole="button"
          className="mt-1 flex-row items-center gap-1"
          onPress={() => message.clientId && onRetry(message.clientId)}
          testID={`chat-retry-${message.clientId ?? message.id}`}>
          <Icon as={AlertCircle} className="text-destructive" size={12} />
          <Text className="text-destructive text-xs">전송 실패 · 다시 시도</Text>
        </Pressable>
      ) : sending ? (
        <Text className="text-muted-foreground mt-1 text-xs" testID="chat-bubble-sending">
          전송 중…
        </Text>
      ) : null}
    </View>
  );
}

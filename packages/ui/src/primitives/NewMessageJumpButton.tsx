import * as React from 'react';
import { Pressable } from 'react-native';
import { ArrowDown } from 'lucide-react-native';

import { Text } from './Text';
import { cn } from '../lib/cn';
import { shadow } from '../tokens/shadow';

/**
 * NewMessageJumpButton — 스크롤이 위에 있을 때 하단에 뜨는 '↓ N개 새 메시지' pill.
 * Badge(순수 표시)와 달리 탭(scroll-to-bottom)+floating 레이아웃을 소유 → 신규.
 * count<=0 또는 visible=false면 렌더 안 함. 색·치수 토큰 className만(D-04).
 */
export interface NewMessageJumpButtonProps {
  count: number;
  onPress: () => void;
  visible?: boolean;
  className?: string;
}

export function NewMessageJumpButton({
  count,
  onPress,
  visible = true,
  className,
}: NewMessageJumpButtonProps) {
  if (!visible || count <= 0) return null;
  return (
    <Pressable
      testID="new-message-jump"
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-[6px] self-center rounded-full bg-accent px-[14px] py-[8px]',
        className,
      )}
      style={shadow.pop.rn}
    >
      <ArrowDown size={14} color="#FFFFFF" />
      <Text className="text-[14px] font-semibold text-white">{`↓ ${count}개 새 메시지`}</Text>
    </Pressable>
  );
}

NewMessageJumpButton.displayName = 'NewMessageJumpButton';

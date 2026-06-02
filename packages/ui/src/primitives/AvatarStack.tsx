import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Avatar } from './Avatar';
import { Text } from './Text';
import { cn } from '../lib/cn';

export interface AvatarStackItem {
  userId: string;
  initial?: string;
  /** 비표준 아바타 bg className(§3A). 예: 'bg-[#7A8DB8]'. */
  bg?: string;
  photoUrl?: string;
}

export interface AvatarStackProps extends Omit<ViewProps, 'children'> {
  items: AvatarStackItem[];
  /** 표시할 최대 아바타 수. 초과분은 +N pill. 기본 3. */
  max?: number;
  /** 아바타 지름(px). 기본 26. */
  size?: number;
  className?: string;
}

/**
 * AvatarStack — 겹쳐 보이는 멤버 아바타 묶음 (S13a 헤더 "누가 이 방에 있나").
 *
 * SSOT: 디자인 목업 S13a 헤더 우측 아바타 스택. 각 아바타는 paper 보더로
 * 분리(겹침), 초과분은 bg-2 `+N` pill. 색·치수 토큰 className 만(D-04) —
 * Avatar 가 자체적으로 `w-[Npx] h-[Npx]` 를 className 으로 인코딩하므로
 * inline style 없이 동적 size 표현이 된다.
 */
export function AvatarStack({ items, max = 3, size = 26, className, ...rest }: AvatarStackProps) {
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;
  return (
    <View className={cn('flex-row items-center', className)} {...rest}>
      {shown.map((it, i) => (
        <View
          key={it.userId}
          className={cn('rounded-full border-2 border-paper', i > 0 && '-ml-[8px]')}
        >
          <Avatar initial={it.initial} photoUrl={it.photoUrl} size={size} bg={it.bg} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          className={cn(
            '-ml-[8px] items-center justify-center rounded-full border-2 border-paper bg-bg-2',
            `w-[${size}px] h-[${size}px]`,
          )}
        >
          <Text className="text-[10px] font-bold text-ink-3">{`+${overflow}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

AvatarStack.displayName = 'AvatarStack';

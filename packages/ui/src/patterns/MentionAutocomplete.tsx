import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { Avatar } from '../primitives/Avatar';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';
import { shadow } from '../tokens/shadow';

/**
 * MentionAutocomplete (X10) — @자동완성 후보 패널.
 *
 * InputBar 바로 위에 뜨는 floating 후보 리스트. caller가 self/blocked/left를
 * 사전 제외해 candidates로 넘긴다(DS는 표시+선택만). Select(트리거 전용)·
 * Popover(고정위치·label-only)와 다른 책임이라 신규 pattern.
 *
 * 색·치수는 토큰 className만(D-04). shadow는 RN style로(토큰 shadow.pop.rn).
 */
export interface MentionCandidate {
  userId: string;
  name: string;
  avatarInitial?: string;
  /** peer 식별 bg className(§3A). 예: 'bg-[#7A8DB8]'. */
  avatarBg?: string;
  /**
   * 동명이인/동일 prefix 다수 후보 구분용 보조 식별 라벨(input-parse-4).
   * name 만으로 같아 보이는 행을 구분하도록 caller 가 짧은 식별자(팀/별칭 등)를
   * 주입한다. 미지정 시 보조 라벨을 렌더하지 않는다(기본 동작 불변).
   */
  secondaryLabel?: string;
}

export interface MentionAutocompleteProps extends Omit<ViewProps, 'children'> {
  candidates: MentionCandidate[];
  onSelect: (c: MentionCandidate) => void;
  /** false면 렌더 안 함. 기본 true. */
  visible?: boolean;
  /** 후보 0명일 때 표시할 muted 라벨. 없으면 null 반환. */
  emptyLabel?: string;
  className?: string;
}

// 패널: paper 표면 + 상단 라운드 + 상단 라인 + pop 그림자(시트 위에 떠 보이게).
const PANEL_CLASS = 'overflow-hidden rounded-t-md border-t border-line bg-paper';

export function MentionAutocomplete({
  candidates,
  onSelect,
  visible = true,
  emptyLabel,
  className,
  ...rest
}: MentionAutocompleteProps) {
  if (!visible) return null;
  if (candidates.length === 0) {
    if (emptyLabel == null) return null;
    return (
      <View className={cn(PANEL_CLASS, className)} style={shadow.pop.rn} {...rest}>
        <Text variant="caption" tone="ink-3" className="px-[14px] py-[12px]">
          {emptyLabel}
        </Text>
      </View>
    );
  }
  return (
    <View className={cn(PANEL_CLASS, className)} style={shadow.pop.rn} {...rest}>
      {candidates.map((c) => (
        <Pressable
          key={c.userId}
          testID={`mention-row-${c.userId}`}
          accessibilityRole="button"
          onPress={() => onSelect(c)}
          className="flex-row items-center gap-[8px] px-[14px] py-[8px] active:bg-bg-2"
        >
          <Avatar initial={c.avatarInitial} size={28} bg={c.avatarBg} />
          <Text className="text-[15px] text-ink">{c.name}</Text>
          {c.secondaryLabel != null ? (
            <Text
              testID={`mention-row-${c.userId}-secondary`}
              variant="caption"
              tone="ink-3"
              numberOfLines={1}
              className="shrink"
            >
              {c.secondaryLabel}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

MentionAutocomplete.displayName = 'MentionAutocomplete';

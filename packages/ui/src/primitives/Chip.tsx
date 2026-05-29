import * as React from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';

import { cn } from '../lib/cn';

/**
 * Chip — P8 primitive (커버리지 매트릭스 §P8).
 *
 * SSOT: all-screens 와이어프레임 `.s06 .chip` CSS (멤버 칩) + NicknameChip/
 * MemberChip/TargetMemberChip 별칭. 등장 화면 S06,S13a,S13b,S21.
 *
 * S06 원본 CSS:
 *  - .chip      paper + 1px line + r-full, padding 4px 12px 4px 4px, gap 7px
 *  - .chip .name  13px/500 ink
 *  - .chip .x     ink-4 11px (제거 버튼)
 *  - .chip.me   border-color accent + 내부 .bdg(accent-soft pill, accent 9px/700)
 *  - .chip.busy border-color warn + dashed, .name → warn
 *  - .chip.add  transparent + 1px dashed ink-4, ink-3 12.5px, padding 6px 12px
 *
 * 규칙(DS 강제): 모든 시각 토큰은 @dei/ui preset 의 className 으로만 표현.
 * raw hex / inline style / StyleSheet 금지.
 *
 * variant
 *  - `default` paper + 1px line — 일반 멤버 칩(× 제거 가능)
 *  - `me`      border-accent — 본인 칩(보통 "초대한 사람" badge, 제거 불가)
 *  - `busy`    border-warn + dashed, 라벨 warn — 다른 방 사용 중 멤버
 *  - `add`     transparent + dashed ink-4 — "+ 친구" 추가 트리거
 *
 * slot
 *  - `avatar`   왼쪽 아바타 슬롯(Avatar primitive 또는 임의 노드). add 변형은 무시.
 *  - `removable` × 제거 버튼 노출. `onRemove` 와 함께 사용. me/add 에는 부적합.
 */
export type ChipVariant = 'default' | 'me' | 'busy' | 'add';

export interface ChipProps extends Omit<ViewProps, 'children'> {
  /** 칩 변형. 기본 `default`. */
  variant?: ChipVariant;
  /** 칩 라벨(이름/닉네임). add 변형은 보통 "+ 친구" 같은 라벨. */
  label?: React.ReactNode;
  /** 왼쪽 아바타 슬롯. Avatar primitive 등 임의 노드. add 변형에선 무시. */
  avatar?: React.ReactNode;
  /** me 변형의 보조 배지(예: "초대한 사람"). accent-soft pill 로 렌더. */
  badge?: React.ReactNode;
  /** × 제거 버튼 노출. */
  removable?: boolean;
  /** 제거 버튼 탭 콜백. */
  onRemove?: (e: GestureResponderEvent) => void;
  /** 라벨 Text 에 머지할 className. */
  textClassName?: string;
}

/**
 * 변형별 컨테이너 className (S06 CSS 값 그대로).
 * 공통: r-full, gap, 가로 정렬. 변형별 배경/보더만 분기.
 */
const CONTAINER_CLASS: Record<ChipVariant, string> = {
  // .chip: paper + 1px line, padding 4px 12px 4px 4px (avatar 좌측 여백 축소), gap 7px
  default: 'flex-row items-center gap-[7px] self-start rounded-full border border-line bg-paper py-[4px] pl-[4px] pr-[12px]',
  // .chip.me: default + border-accent
  me: 'flex-row items-center gap-[7px] self-start rounded-full border border-accent bg-paper py-[4px] pl-[4px] pr-[12px]',
  // .chip.busy: default + border-warn + dashed
  busy: 'flex-row items-center gap-[7px] self-start rounded-full border border-dashed border-warn bg-paper py-[4px] pl-[4px] pr-[12px]',
  // .chip.add: transparent + 1px dashed ink-4, padding 6px 12px (아바타 없음)
  add: 'flex-row items-center self-start rounded-full border border-dashed border-ink-4 bg-transparent px-[12px] py-[6px]',
};

/** 변형별 라벨 className (.name 13px/500 ink, busy→warn, add→ink-3 12.5px) */
const LABEL_CLASS: Record<ChipVariant, string> = {
  default: 'text-[13px] font-medium text-ink',
  me: 'text-[13px] font-medium text-ink',
  // .chip.busy .name: warn
  busy: 'text-[13px] font-medium text-warn',
  // .chip.add: ink-3 12.5px
  add: 'text-[12.5px] font-medium text-ink-3',
};

/**
 * Chip primitive.
 *
 * variant 별 토큰 className 을 기본 적용한 뒤 `props.className` 을 cn() 으로
 * 병합(마지막 승). add 변형은 라벨만(아바타/제거 무시), me 변형은 badge pill 지원.
 */
export const Chip = React.forwardRef<View, ChipProps>(function Chip(
  {
    variant = 'default',
    label,
    avatar,
    badge,
    removable = false,
    onRemove,
    textClassName,
    className,
    accessibilityRole,
    ...rest
  },
  ref,
) {
  const isAdd = variant === 'add';

  return (
    <View
      ref={ref}
      className={cn(CONTAINER_CLASS[variant], className)}
      accessibilityRole={accessibilityRole}
      {...rest}
    >
      {/* avatar 슬롯 — add 변형은 아바타 없음 */}
      {!isAdd && avatar != null ? avatar : null}

      {/* me 변형 보조 배지 (.bdg accent-soft pill) */}
      {variant === 'me' && badge != null ? (
        <View className="rounded-full bg-accent-soft px-[5px] py-[1px]">
          <Text className="text-[9px] font-bold text-accent">{badge}</Text>
        </View>
      ) : null}

      {/* 라벨 */}
      {label != null ? (
        <Text className={cn(LABEL_CLASS[variant], textClassName)}>{label}</Text>
      ) : null}

      {/* × 제거 버튼 (.x ink-4) — add 변형엔 부적합하므로 제외 */}
      {!isAdd && removable ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="제거"
          hitSlop={8}
          className="ml-[2px]"
        >
          <Text className="text-[11px] text-ink-4">×</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

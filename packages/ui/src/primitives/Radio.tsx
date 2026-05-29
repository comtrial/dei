import { forwardRef } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * P10 — Radio (RadioIndicator / dot) primitive.
 *
 * SSOT: all-screens 와이어프레임 `.rd` CSS (S16/S17/S20/S21).
 *   empty    : 18x18 circle, r-full, `border 1.5px solid var(--ink-4)`.
 *   selected : `.sel .rd` → border-color + background = tone,
 *              `box-shadow: inset 0 0 0 3px white` (ink-filled ring).
 *
 * RN 에는 신뢰할 수 있는 inset box-shadow 가 없으므로, 선택 시 바깥 원을
 * tone 색으로 채우고 3px 안쪽에 white(`bg-paper`) 내부 원을 겹쳐 동일한
 * inset-fill 링을 만든다.
 *
 * tone:
 *   ink    — S16 사유 목록 (기본)
 *   accent — S21 카테고리 / S17 가격 옵션
 *   danger — S20 신고 사유
 *
 * 색은 모두 토큰 className 으로만 표현 (inline style 금지, DS D-04).
 */
export type RadioTone = 'ink' | 'accent' | 'danger';

export interface RadioProps extends Omit<PressableProps, 'children' | 'style'> {
  /** 선택 상태 (inset-fill 링 노출). */
  selected?: boolean;
  /** 선택 시 채움/테두리 톤. 기본 ink. */
  tone?: RadioTone;
  /** 컨테이너 className 머지. */
  className?: string;
}

// 선택 시 tone 별 바깥 원 (border + background) 클래스.
// NativeWind 는 정적 class 만 추출 → 동적 보간 금지, 완전한 리터럴로 분기.
const SELECTED_TONE: Record<RadioTone, string> = {
  ink: 'border-ink bg-ink',
  accent: 'border-accent bg-accent',
  danger: 'border-danger bg-danger',
};

export const Radio = forwardRef<View, RadioProps>(function Radio(
  {
    selected = false,
    tone = 'ink',
    className,
    accessibilityState,
    ...pressableProps
  },
  ref,
) {
  // 바깥 원: 18x18, r-full. empty → ink-4 테두리, selected → tone 채움.
  const dotClassName = cn(
    'h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px]',
    selected ? SELECTED_TONE[tone] : 'border-ink-4',
    className,
  );

  return (
    <Pressable
      ref={ref}
      accessibilityRole="radio"
      accessibilityState={{ selected, ...accessibilityState }}
      {...pressableProps}
    >
      <View className={dotClassName}>
        {selected ? (
          // inset 0 0 0 3px white — 3px 안쪽 white 내부 원으로 inset-fill 재현.
          <View className="absolute inset-[3px] rounded-full bg-paper" />
        ) : null}
      </View>
    </Pressable>
  );
});

Radio.displayName = 'Radio';

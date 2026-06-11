import { forwardRef } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * P9 — Checkbox primitive.
 *
 * SSOT: all-screens 와이어프레임 `.s02 .check` / `.check-all` CSS.
 *   - round  : 22x22, r-full, 1.5px ink border, checked → ✓ (ink)
 *   - square : r-sm 변형 (matrix §P9 "r3"); round 과 동일 토대, 모서리만 사각
 *   - master : 24x24, r-full, bg-ink + white ✓ (S02 "모두 동의" 헤더)
 *
 * `optional`(opt) off 상태는 ink-4 (테두리·글리프), 켜지면(opt.on) ink 로 복귀.
 * 색은 모두 토큰 className 으로만 표현 (inline style 금지, DS D-04).
 */
export type CheckboxVariant = 'round' | 'square' | 'master';

export interface CheckboxProps
  extends Omit<PressableProps, 'children' | 'style'> {
  /** P9 변형. 기본 round. */
  variant?: CheckboxVariant;
  /** 체크 상태 (ink fill / ✓). */
  checked?: boolean;
  /** 선택(opt) 항목 — off 일 때 ink-4 톤. master 에는 영향 없음. */
  optional?: boolean;
  /** 컨테이너 className 머지. */
  className?: string;
}

// 체크 글리프 — HTML 의 '✓' 그대로.
const CHECK_GLYPH = '✓';

export const Checkbox = forwardRef<View, CheckboxProps>(function Checkbox(
  {
    variant = 'round',
    checked = false,
    optional = false,
    className,
    accessibilityState,
    testID,
    ...pressableProps
  },
  ref,
) {
  const isMaster = variant === 'master';
  // optional off → ink-4 톤, 그 외(필수 or 켜짐) → ink 톤.
  // NativeWind 는 정적 class 만 추출 → 동적 보간 금지, 완전한 리터럴로 분기.
  const dimInk = optional && !checked;

  const boxClassName = cn(
    'items-center justify-center',
    // size: master 24x24, round/square 22x22 (HTML 값 그대로).
    isMaster ? 'h-6 w-6' : 'h-[22px] w-[22px]',
    // shape: round/master = r-full, square = r-sm.
    variant === 'square' ? 'rounded-sm' : 'rounded-full',
    // fill / border.
    isMaster && 'bg-ink',
    !isMaster && 'border-[1.5px]',
    !isMaster && (dimInk ? 'border-ink-4' : 'border-ink'),
    className,
  );

  // ✓ 색: master = white(=bg), round/square = ink (off+optional → ink-4).
  const glyphClassName = cn(
    'leading-none',
    isMaster && 'text-[15px] text-bg',
    !isMaster && 'text-[14px]',
    !isMaster && (dimInk ? 'text-ink-4' : 'text-ink'),
  );

  // master 는 항상 채워진 헤더 표현 → ✓ 상시 노출.
  const showGlyph = isMaster || checked;

  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isMaster ? true : checked, ...accessibilityState }}
      {...pressableProps}
    >
      <View
        testID={testID ? `${testID}-box` : undefined}
        className={boxClassName}
      >
        {showGlyph ? <Text className={glyphClassName}>{CHECK_GLYPH}</Text> : null}
      </View>
    </Pressable>
  );
});

Checkbox.displayName = 'Checkbox';

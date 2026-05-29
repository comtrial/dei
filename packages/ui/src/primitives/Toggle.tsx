import { forwardRef } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * P11 — Toggle (Switch) primitive.
 *
 * SSOT: all-screens 와이어프레임 `.s22 .toggle` CSS (알림 설정 S22) +
 * `.s10 .mic-toggle`(상태 토글 별칭, 커버리지 매트릭스 §P11).
 *   track    : 44x26, border-radius 13(=r-full), background var(--accent)
 *   .off     : background var(--ink-4)
 *   thumb(::after): 20x20 원형, top 3px, white,
 *              box-shadow 0 1px 3px rgba(0,0,0,.2)
 *              on  → right 3px (오른쪽), off → left 3px (왼쪽)
 *
 * RN 에는 ::after 가 없으므로 track(View) 안에 absolute 로 thumb(View) 를 겹쳐
 * 동일한 스위치를 만든다. value 로 thumb 의 좌/우 정렬과 track 색을 분기.
 *
 * 색·치수는 모두 토큰 className 으로만 표현 (inline style 금지, DS D-04).
 */
export interface ToggleProps
  extends Omit<PressableProps, 'children' | 'style' | 'onPress'> {
  /** on/off 상태. on → accent track + thumb 오른쪽. 기본 false. */
  value?: boolean;
  /** 상태 토글 콜백. 다음 상태(!value)를 인자로 받는다. */
  onValueChange?: (value: boolean) => void;
  /** track className 머지. */
  className?: string;
}

/**
 * thumb 그림자 — HTML `box-shadow: 0 1px 3px rgba(0,0,0,.2)`.
 * §3A 에서 `--shadow-thumb` 승격 후보로 플래그된 국소색이나 아직 토큰 미정의 →
 * §3 지침대로 컴포넌트 상수(NativeWind 기본 shadow 유틸)로 처리, raw 누수 방지.
 */
const THUMB_SHADOW = 'shadow-sm';

export const Toggle = forwardRef<View, ToggleProps>(function Toggle(
  { value = false, onValueChange, className, accessibilityState, testID, ...pressableProps },
  ref,
) {
  // track: 44x26 r-full. on → accent, off → ink-4 (HTML 값 그대로).
  // NativeWind 는 정적 class 만 추출 → 동적 보간 금지, 완전한 리터럴로 분기.
  const trackClassName = cn(
    'h-[26px] w-[44px] shrink-0 justify-center rounded-full',
    value ? 'bg-accent' : 'bg-ink-4',
    className,
  );

  // thumb: 20x20 white 원, 3px inset. on → 오른쪽(right-[3px]), off → 왼쪽(left-[3px]).
  const thumbClassName = cn(
    'absolute h-[20px] w-[20px] rounded-full bg-white',
    value ? 'right-[3px]' : 'left-[3px]',
    THUMB_SHADOW,
  );

  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, ...accessibilityState }}
      onPress={() => onValueChange?.(!value)}
      {...pressableProps}
    >
      <View testID={testID ? `${testID}-track` : undefined} className={trackClassName}>
        <View testID={testID ? `${testID}-thumb` : undefined} className={thumbClassName} />
      </View>
    </Pressable>
  );
});

Toggle.displayName = 'Toggle';

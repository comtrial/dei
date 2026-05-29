import { forwardRef, useEffect } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '../lib/cn';

/**
 * Spinner (P13) — bg-2 track + accent head 회전 로딩 인디케이터.
 *
 * SSOT: all-screens 와이어프레임
 *   - `.s01 .pulse`   36x36 / border 3px solid var(--bg-2) / border-top var(--accent) / spin 1.1s
 *   - `.s03 .progress-ring` 80x80 / border 5px solid var(--bg-2) / border-top var(--accent) / spin 1s
 *
 * 색은 토큰 className(border-bg-2 / border-t-accent)으로만 지정한다. 회전은
 * reanimated transform(rotate)이라 색·inline-style 금지 규칙에 해당하지 않는다.
 */
export type SpinnerSize = 36 | 80;
export type SpinnerVariant = 'inline' | 'overlay';

export interface SpinnerProps extends Omit<ViewProps, 'style'> {
  /** 링 지름(px). HTML 원천값 그대로. */
  size?: SpinnerSize;
  /** inline: 흐름 안. overlay: 화면 위 중앙 정렬 + 반투명 배경. */
  variant?: SpinnerVariant;
  /** 추가 className (cn 으로 머지). */
  className?: string;
}

// size → HTML 원천 (지름 / border 두께 / 1회전 주기 ms)
const SIZE_SPEC: Record<SpinnerSize, { ring: string; border: string; duration: number }> = {
  36: { ring: 'h-[36px] w-[36px]', border: 'border-[3px]', duration: 1100 },
  80: { ring: 'h-[80px] w-[80px]', border: 'border-[5px]', duration: 1000 },
};

export const Spinner = forwardRef<View, SpinnerProps>(function Spinner(
  { size = 36, variant = 'inline', className, accessibilityLabel, ...rest },
  ref,
) {
  const rotation = useSharedValue(0);
  const { ring, border, duration } = SIZE_SPEC[size];

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration, easing: Easing.linear }),
      -1, // infinite (HTML: animation ... infinite)
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      ref={ref}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? '로딩 중'}
      className={cn(
        variant === 'overlay' &&
          'absolute inset-0 z-10 items-center justify-center bg-bg/60',
        variant === 'inline' && 'items-center justify-center',
        className,
      )}
      {...rest}
    >
      <Animated.View
        // border-bg-2 = track, border-t-accent = head (회전하는 윗선)
        className={cn('rounded-full border-bg-2 border-t-accent', ring, border)}
        style={animatedStyle}
      />
    </View>
  );
});

Spinner.displayName = 'Spinner';

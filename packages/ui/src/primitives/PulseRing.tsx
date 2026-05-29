import { forwardRef, useEffect } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '../lib/cn';

/**
 * PulseRing (P20) — 매칭 중(S07) 의 펄스 인디케이터.
 *
 * SSOT: all-screens 와이어프레임 `.s07 .pulse-area` 트리
 *   - `.pulse-area`  position:relative / 140x140 (컨테이너)
 *   - `.ring`        inset:0 / r-full / radial-gradient(accent-soft→transparent) /
 *                    animation: pulse 2s ease-out infinite
 *   - `.ring.r2`     animation-delay:.7s (두 번째 링이 0.7s 늦게 펄스)
 *   - `.core`        inset:38px / r-full / bg accent / 중앙 슬롯(글리프/숫자)
 *   - `@keyframes pulse` 0%{scale .6, opacity .7} → 100%{scale 1.4, opacity 0}
 *
 * 색은 토큰 className(bg-accent-soft 링 / bg-accent core)으로만 지정한다.
 * 펄스(scale·opacity)는 reanimated transform/opacity 라 inline-style 금지
 * 규칙에 해당하지 않는다(Spinner P13 과 동일한 근거).
 *
 * RN 한계 주석: HTML 의 `radial-gradient(accent-soft→transparent 70%)` 는
 * NativeWind className 으로 표현 불가 → 그라디언트의 지배색인 단색
 * `bg-accent-soft` 로 근사한다(토큰 외 색 도입 없음). 가장자리 페이드는
 * 펄스 키프레임의 opacity 0 수렴이 시각적으로 대체한다.
 */

// HTML 원천값 (140x140 area / core inset 38px / pulse 2s / r2 delay 0.7s).
const AREA = 'h-[140px] w-[140px]';
const CORE_INSET = 'inset-[38px]'; // .core { inset: 38px }
const PULSE_DURATION = 2000; // @keyframes pulse 2s
const RING2_DELAY = 700; // .ring.r2 { animation-delay: .7s }

// @keyframes pulse 의 시작/끝 값 (0% → 100%).
const SCALE_FROM = 0.6;
const SCALE_TO = 1.4;
const OPACITY_FROM = 0.7;
const OPACITY_TO = 0;

export interface PulseRingProps extends Omit<ViewProps, 'style'> {
  /** 펄스 링 개수. HTML S07 은 2(.ring + .ring.r2). 기본 2. */
  rings?: number;
  /** core 슬롯 내용(글리프/이니셜/숫자). 비우면 빈 accent 원만 렌더. */
  core?: React.ReactNode;
  /** 첫 링의 시작 지연(ms). 두 번째 링은 여기에 RING2_DELAY 가 더해진다. */
  delay?: number;
  /** 컨테이너 추가 className (cn 으로 머지). */
  className?: string;
}

/** 단일 펄스 링 — scale + opacity 를 무한 반복(ease-out)하며 delay 만큼 늦게 시작. */
const PulseRingLayer = ({ delay }: { delay: number }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: PULSE_DURATION, easing: Easing.out(Easing.ease) }),
        -1, // infinite (HTML: animation ... infinite)
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: SCALE_FROM + (SCALE_TO - SCALE_FROM) * progress.value },
    ],
    opacity: OPACITY_FROM + (OPACITY_TO - OPACITY_FROM) * progress.value,
  }));

  return (
    // .ring: inset:0 / r-full / bg accent-soft (radial-gradient 근사)
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 rounded-full bg-accent-soft"
      style={animatedStyle}
    />
  );
};

export const PulseRing = forwardRef<View, PulseRingProps>(function PulseRing(
  { rings = 2, core, delay = 0, className, accessibilityLabel, ...rest },
  ref,
) {
  const ringCount = Math.max(0, Math.floor(rings));

  return (
    // .pulse-area: position:relative / 140x140 / 중앙 정렬
    <View
      ref={ref}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? '매칭 중'}
      className={cn('relative items-center justify-center', AREA, className)}
      {...rest}
    >
      {Array.from({ length: ringCount }).map((_, i) => (
        // .ring / .ring.r2 — i 번째 링은 RING2_DELAY 간격으로 staggered.
        <PulseRingLayer key={i} delay={delay + i * RING2_DELAY} />
      ))}
      {/* .core: inset 38px / r-full / bg accent / 중앙 슬롯 */}
      <View
        className={cn('absolute items-center justify-center rounded-full bg-accent', CORE_INSET)}
      >
        {core}
      </View>
    </View>
  );
});

PulseRing.displayName = 'PulseRing';

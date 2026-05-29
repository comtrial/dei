import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '../lib/cn';

/**
 * ProgressBar (P12) — 선형 진행 표시 + 세그먼트(dots) 변형.
 *
 * SSOT: all-screens 와이어프레임
 *  - 선형(default): `.s04 .progress-row .bar` 4px / bg-2 track / accent fill / r-full.
 *    (HTML 원본은 radius 2px 이나 DS 명세상 r-full 로 통일 — track/fill 동일 radius)
 *  - 세그먼트(`segmented`): `.s11 .indicator` / `.s18 .progress` — 균등 분할 dot,
 *    active(accent) / inactive(track) 상태.
 *
 * 토큰만 사용: bg-2(track) / accent(fill). overlay(video) 톤은 X11 FullscreenVideo
 * 패턴이 자신의 glass 컨텍스트에서 처리하므로 본 primitive 는 토큰 경로만 노출한다.
 */
export interface ProgressBarProps extends Omit<ViewProps, 'children'> {
  /** 진행률 0~1. 범위를 벗어나면 클램프된다. (선형 모드) */
  value?: number;
  /**
   * 세그먼트(dots) 모드. 숫자면 세그먼트 개수, 배열이면 각 칸의 채움 여부.
   * 미지정(undefined) 이면 선형 track/fill 모드.
   */
  segmented?: number | boolean[];
  /** 트랙 높이(px). 기본 4 (선형) / 4 (세그먼트). */
  height?: number;
  className?: string;
  /** fill 영역에 적용할 추가 className (선형 모드). */
  fillClassName?: string;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 진행률(0~1) → tailwind width 퍼센트(0,5,10,...,100) 클래스. */
function widthClass(value: number): string {
  const pct = Math.round(clamp01(value) * 20) * 5; // 5% 스텝
  return WIDTH_CLASSES[pct] ?? 'w-0';
}

// NativeWind 는 정적 className 만 추출 → 동적 `w-[..]` 대신 미리 나열한 맵 사용.
const WIDTH_CLASSES: Record<number, string> = {
  0: 'w-0',
  5: 'w-[5%]',
  10: 'w-[10%]',
  15: 'w-[15%]',
  20: 'w-1/5',
  25: 'w-1/4',
  30: 'w-[30%]',
  35: 'w-[35%]',
  40: 'w-2/5',
  45: 'w-[45%]',
  50: 'w-1/2',
  55: 'w-[55%]',
  60: 'w-3/5',
  65: 'w-[65%]',
  70: 'w-[70%]',
  75: 'w-3/4',
  80: 'w-4/5',
  85: 'w-[85%]',
  90: 'w-[90%]',
  95: 'w-[95%]',
  100: 'w-full',
};

export const ProgressBar = forwardRef<View, ProgressBarProps>(function ProgressBar(
  { value = 0, segmented, height = 4, className, fillClassName, style, ...rest },
  ref,
) {
  // ── 세그먼트(dots) 모드 ──────────────────────────────────────────────
  if (segmented !== undefined) {
    const filled: boolean[] = Array.isArray(segmented)
      ? segmented
      : Array.from({ length: Math.max(0, Math.floor(segmented)) }, (_, i) => {
          // 숫자 모드: value(0~1) 기준 채워질 칸 수.
          const count = Math.max(0, Math.floor(segmented));
          return i < Math.round(clamp01(value) * count);
        });

    return (
      <View
        ref={ref}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: filled.length, now: filled.filter(Boolean).length }}
        className={cn('flex-row gap-[5px]', className)}
        style={[{ height }, style]}
        {...rest}
      >
        {filled.map((on, i) => (
          <View
            key={i}
            testID={`progressbar-segment-${i}`}
            className={cn('flex-1 rounded-full', on ? 'bg-accent' : 'bg-bg-2')}
            style={{ height }}
          />
        ))}
      </View>
    );
  }

  // ── 선형 track/fill 모드 ─────────────────────────────────────────────
  const v = clamp01(value);
  return (
    <View
      ref={ref}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 1, now: v }}
      className={cn('w-full overflow-hidden rounded-full bg-bg-2', className)}
      style={[{ height }, style]}
      {...rest}
    >
      <View
        testID="progressbar-fill"
        className={cn('h-full rounded-full bg-accent', widthClass(v), fillClassName)}
      />
    </View>
  );
});

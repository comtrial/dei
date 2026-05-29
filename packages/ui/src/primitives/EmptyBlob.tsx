import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * EmptyBlob (P21) — GridRoom 빈 셀의 "안 올림" 얼굴 placeholder.
 *
 * SSOT: all-screens 와이어프레임 8셀 방(JSON `S13` / HTML `.s12 .cell.empty`)의
 * `.blob` + `::before/::after`(눈) + `.mouth`(입). 매트릭스 §P21 / §3B.
 *
 * 색 처리(§3B 지침): blob 본체 3색(#FF1B9D/#74E36A/#9A7AE8)은 의미 1회성 장식이라
 * `tone` prop 3종 enum 의 **컴포넌트 내부 상수**로 둔다(토큰 승격 금지). 눈·입의
 * 어두운 색(#1A1A1A — 셀 dark 배경)도 동일한 패턴 dark 상수. 모든 색·치수는
 * NativeWind className(arbitrary-value 포함)으로만 인코딩 —
 * inline `style={{}}` / raw hex `style` / StyleSheet 미사용(DS D-04).
 *
 * 얼굴 지오메트리는 HTML 비율 그대로 (size 에 비례한 % 위치):
 *  - blob: 정원(rounded-full)
 *  - 눈: blob 폭의 8%, top 38%, 좌우 30%
 *  - 입: blob 폭의 32% × 14%, bottom 30%, 하단 둥근(rounded-b-full)
 */
export type EmptyBlobTone = 'pink' | 'green' | 'purple';

export interface EmptyBlobProps extends ViewProps {
  /** 얼굴 색. HTML 사용분: purple(동현)·pink(유민)·green(지훈). 기본 `pink`. */
  tone?: EmptyBlobTone;
  /** blob 지름(px). 기본 56 (셀 폭의 ~60% 근사). */
  size?: number;
  className?: string;
}

// §3B 컴포넌트 내부 상수 — blob 본체 3색(토큰 아님, 장식 enum).
const TONE_BG: Record<EmptyBlobTone, string> = {
  pink: 'bg-[#FF1B9D]',
  green: 'bg-[#74E36A]',
  purple: 'bg-[#9A7AE8]',
};

// 눈·입은 셀 dark 배경색(#1A1A1A)으로 음각 — 패턴 dark 상수.
const FEATURE_BG = 'bg-[#1A1A1A]';

export const EmptyBlob = forwardRef<View, EmptyBlobProps>(function EmptyBlob(
  { tone = 'pink', size = 56, className, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      accessibilityRole="image"
      accessibilityLabel="아직 오늘 영상을 올리지 않은 멤버"
      className={cn(
        'relative rounded-full',
        `w-[${size}px] h-[${size}px]`,
        TONE_BG[tone],
        className,
      )}
      {...rest}
    >
      {/* 왼 눈 — width 8%, top 38%, left 30% (HTML ::before) */}
      <View
        className={cn(
          'absolute aspect-square rounded-full w-[8%] top-[38%] left-[30%]',
          FEATURE_BG,
        )}
      />
      {/* 오른 눈 — right 30% (HTML ::after) */}
      <View
        className={cn(
          'absolute aspect-square rounded-full w-[8%] top-[38%] right-[30%]',
          FEATURE_BG,
        )}
      />
      {/* 입 — width 32% × height 14%, bottom 30%, 하단 반원 (HTML .mouth) */}
      <View
        className={cn(
          'absolute self-center rounded-b-full w-[32%] h-[14%] bottom-[30%]',
          FEATURE_BG,
        )}
      />
    </View>
  );
});

EmptyBlob.displayName = 'EmptyBlob';

import * as React from 'react';
import { type ComponentType } from 'react';
import { View as RNView, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { Card } from '../primitives/Card';
import { Text } from '../primitives/Text';

/**
 * X14 — CompareCard pattern (커버리지 매트릭스 §X14, S17 결제 비교).
 *
 * SSOT: all-screens 와이어프레임 `.s17 .compare` / `.card.cur` / `.card.now` CSS.
 *   .compare        grid 2col(1fr 1fr) gap 8px
 *   .card           padding 14px/12px, radius r-md(HTML) → r-lg(매트릭스 §X14·작업명세)
 *                   text-align center
 *   .card.cur       background var(--bg-2)
 *   .card.now       background var(--ink); color white; radial accent glow(::before)
 *   .card .lbl      10px/700 uppercase letter-spacing .06em mb 6px
 *                     .cur .lbl → ink-3 / .now .lbl → accent
 *   .card .val      20px/800 tabular-nums line-height 1.1
 *                     .cur .val → ink / .now .val → white
 *   .card .sub      10.5px mt 3px
 *                     .cur .sub → ink-3 / .now .sub → white@60%
 *
 * "그냥 기다리기(cur)" vs "바로 매치(now)" 두 열을 나란히 비교한다. now 열은 ink
 * 표면 + 우상단 accent radial glow 로 강조한다(BM 결제 유도).
 *
 * 규칙(DS 강제 D-04):
 *  - 모든 색·크기·굵기·반경은 @dei/ui 토큰 className 으로만 표현(inline style / raw hex 금지).
 *  - 라벨/값/보조문구는 전부 Card + Text primitive 합성. 가격·시간 등 숫자값은 tabular.
 *  - now 열의 radial accent glow 는 §3B "1회성 장식 국소색" → 토큰화하지 않고
 *    expo-linear-gradient 등 외부 그라데이션 컴포넌트를 `GlowComponent` 로 주입한다.
 *    미주입 시(테스트/SSR) accent-soft 토큰 표면 fallback 으로 graceful degrade
 *    (GridRoom 의 GradientComponent 주입 패턴과 동일 — DS 패키지를 Expo 에 비결합 유지).
 */

/**
 * radial accent glow 색 (HTML `.s17 .card.now::before`
 * = `radial-gradient(circle at 100% 0%, rgba(255,45,111,.25), transparent 60%)`).
 * §3B: 1회성 장식 국소색이므로 토큰 승격 없이 컴포넌트 상수로 격리한다.
 * `--accent` (#FF2D6F) 의 25% 불투명 → transparent. GlowComponent.colors 로 전달.
 */
export const NOW_GLOW_COLORS: readonly [string, string] = [
  'rgba(255,45,111,0.25)',
  'rgba(255,45,111,0)',
];

/**
 * expo-linear-gradient `LinearGradient` 와 호환되는 최소 인터페이스.
 * (RN 에 radial 이 없어 우상단→투명 linear 로 근사. start/end 로 방향만 지정.)
 */
export interface GlowComponentProps {
  colors: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: unknown;
  className?: string;
  testID?: string;
}

/** 비교 열 한 칸의 내용. */
export interface CompareColumn {
  /** .lbl — 상단 eyebrow 라벨(uppercase 처리됨). 예: '그냥 기다리기'. */
  label: string;
  /** .val — 강조 값(시간/가격 등). tabular-nums 적용. 예: '23시간 32분'. */
  value: string;
  /** .sub — 하단 보조 문구. 예: '내일 13:45 가능'. */
  sub?: string;
}

export interface CompareCardProps extends ViewProps {
  /** 좌측 cur 열(현재/기본 상태, bg-2 표면). */
  current: CompareColumn;
  /** 우측 now 열(권장/유도 상태, ink 표면 + accent glow). */
  now: CompareColumn;
  /**
   * now 열 우상단 accent glow 렌더 컴포넌트(expo-linear-gradient `LinearGradient`).
   * 미주입 시 accent-soft 토큰 overlay fallback 으로 렌더 — DS 패키지를 Expo 에 비결합 유지.
   */
  GlowComponent?: ComponentType<GlowComponentProps>;
  className?: string;
}

/** 한 비교 열(Card compare 변형) 렌더. tone 에 따라 라벨/값/보조 색을 가른다. */
const CompareColumnCard = React.forwardRef<
  RNView,
  {
    column: CompareColumn;
    tone: 'cur' | 'now';
    testID?: string;
    GlowComponent?: ComponentType<GlowComponentProps>;
  }
>(function CompareColumnCard({ column, tone, testID, GlowComponent }, ref) {
  const isNow = tone === 'now';
  return (
    <Card
      ref={ref}
      variant="compare"
      testID={testID}
      // .card.cur → bg-2 / .card.now → ink + radial glow(overflow-hidden 으로 glow 클립).
      // r-md(Card 기본) → r-lg(§X14·작업명세) 로 승격, flex-1 로 2열 균등.
      className={cn(
        'flex-1 rounded-lg',
        isNow ? 'overflow-hidden bg-ink' : 'bg-bg-2',
      )}
    >
      {/* .now::before — 우상단 accent radial glow(근사). 장식이므로 a11y 트리에서 제외. */}
      {isNow ? (
        GlowComponent ? (
          <GlowComponent
            testID={`${testID ?? 'compare-now'}-glow`}
            colors={NOW_GLOW_COLORS}
            // circle at 100% 0% ≈ 우상단 → 좌하단 방향
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 0.6 }}
            className="absolute inset-0"
          />
        ) : (
          // GlowComponent 미주입 fallback: accent-soft 토큰 overlay(저강도 강조).
          // pointerEvents none — 순수 장식이라 터치/내용 없음(a11y 노드 비오염).
          <RNView
            testID={`${testID ?? 'compare-now'}-glow`}
            pointerEvents="none"
            className="absolute inset-0 bg-accent-soft/20"
          />
        )
      ) : null}

      {/* .lbl — 10px/700 uppercase, mb 6px. cur=ink-3 / now=accent. z-2 로 glow 위. */}
      <Text
        testID={`${testID ?? `compare-${tone}`}-label`}
        variant="eyebrow"
        tone={isNow ? 'accent' : 'ink-3'}
        className="z-[2] mb-[6px] text-[12px] tracking-[0.06em]"
      >
        {column.label}
      </Text>

      {/* .val — 20px/800 tabular, line-height 1.1. cur=ink / now=white. */}
      <Text
        testID={`${testID ?? `compare-${tone}`}-value`}
        variant="h2"
        tabularNums
        className={cn(
          'z-[2] text-[20px] font-extrabold leading-[1.1] tracking-tight',
          isNow ? 'text-white' : 'text-ink',
        )}
      >
        {column.value}
      </Text>

      {/* .sub — 10.5px, mt 3px. cur=ink-3 / now=white@60%. */}
      {column.sub != null ? (
        <Text
          testID={`${testID ?? `compare-${tone}`}-sub`}
          className={cn(
            'z-[2] mt-[3px] text-[12.5px] font-medium',
            isNow ? 'text-white/60' : 'text-ink-3',
          )}
        >
          {column.sub}
        </Text>
      ) : null}
    </Card>
  );
});

export const CompareCard = React.forwardRef<RNView, CompareCardProps>(function CompareCard(
  { current, now, GlowComponent, className, accessibilityLabel, ...rest },
  ref,
) {
  return (
    <RNView
      ref={ref}
      accessibilityRole="summary"
      accessibilityLabel={
        accessibilityLabel ?? `${current.label} ${current.value} 대 ${now.label} ${now.value}`
      }
      // .compare: grid 2col gap 8px → flex-row + gap-[8px] (각 열 flex-1 균등).
      className={cn('flex-row gap-[8px]', className)}
      {...rest}
    >
      <CompareColumnCard testID="compare-cur" column={current} tone="cur" />
      <CompareColumnCard
        testID="compare-now"
        column={now}
        tone="now"
        GlowComponent={GlowComponent}
      />
    </RNView>
  );
});

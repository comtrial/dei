import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * BottomActionBar (X2) — 화면 하단 CTA 바 패턴 (13화면 ← Button).
 *
 * SSOT: all-screens 와이어프레임의 `.cta-bottom` / `.ctas` / `.row` CTA 컨테이너 CSS +
 * 커버리지 매트릭스 §X2. 자식은 Button primitive 이며, 바는 표면·간격·정렬만 책임진다.
 * 모든 시각 토큰은 @dei/ui className 으로만 표현(raw hex / inline style 금지, DS D-04).
 *
 * 레이아웃(HTML 출처):
 *  - `single`  : `.s04/.s06/.s16/.s17/.s21/.s23 .cta-bottom` — 단일 풀폭 CTA(자식 1개).
 *  - `row`     : `.s11b .bottom-ctas` / `.s18 .cta-card .row` / `.sCC .row` —
 *                좌우 2-CTA 가로 배치(gap, 각 자식 flex-1 로 균등 분할).
 *  - `stacked` : `.s03f/.s07a/.s11a .ctas` — primary 위·secondary 아래 세로 스택(gap 10).
 *
 * 공통 컨테이너(HTML `.cta-bottom`): background var(--paper), padding 14px 24px 32px.
 * (하단 32px 는 와이어프레임이 safe-area 를 패딩에 흡수한 값 — 다른 패턴과 동일 관례.)
 *
 * props:
 *  - `layout`    : single | row | stacked (기본 single)
 *  - `borderTop` : 상단 1px line 구분선(`.cta-bottom{border-top:1px solid var(--line)}`).
 *                  S06/S16/S17/S21/S23 는 true, S04 는 false → 기본 false.
 *  - `fixed`     : 화면 하단 고정(`.cta-bottom{position:absolute;bottom:0;left:0;right:0}`).
 *                  RN 에서는 absolute + bottom-0 + inset-x-0 으로 표현. 기본 false.
 */
export type BottomActionBarLayout = 'single' | 'row' | 'stacked';

export interface BottomActionBarProps extends ViewProps {
  /** CTA 배치. 기본 `single`(단일 풀폭). */
  layout?: BottomActionBarLayout;
  /** 상단 1px line 구분선 표시(HTML `border-top:1px solid var(--line)`). 기본 false. */
  borderTop?: boolean;
  /** 화면 하단 고정(absolute bottom). 기본 false. */
  fixed?: boolean;
  /** CTA(Button) 들. row 는 2개, stacked 는 primary/secondary, single 은 1개를 기대. */
  children?: React.ReactNode;
  className?: string;
}

// layout → 자식 배치 className.
//  single  : 세로 단일(풀폭 자식). flex-col 로 자식이 width 100% 차지.
//  row     : .s11b .bottom-ctas / .sCC .row — flex-row + gap 12(=HTML 8~12 중 대표값).
//  stacked : .ctas — flex-col + gap 10, 세로 스택.
const LAYOUT_CLASS: Record<BottomActionBarLayout, string> = {
  single: 'flex-col',
  row: 'flex-row gap-[12px]',
  stacked: 'flex-col gap-[10px]',
};

// .cta-bottom 공통 표면/패딩: paper + 14px 24px 32px (하단 32 = safe-area 흡수).
const BAR_BASE = 'bg-paper px-[24px] pb-[32px] pt-[14px]';

/**
 * X2 BottomActionBar.
 *
 * row 레이아웃은 각 자식을 `flex-1` 래퍼로 감싸 균등 분할한다
 * (HTML `.bottom-ctas .secondary/.primary{flex:1}`, `.row .btn{flex:1}`).
 * 그 외 레이아웃은 자식을 그대로 둔다(single=풀폭, stacked=세로 스택).
 */
export const BottomActionBar = React.forwardRef<View, BottomActionBarProps>(
  function BottomActionBar(
    { layout = 'single', borderTop = false, fixed = false, children, className, ...rest },
    ref,
  ) {
    const content =
      layout === 'row'
        ? React.Children.map(children, (child) =>
            // 각 CTA 를 flex-1 래퍼로 감싸 가로 균등 분할(자식 Button 의 fullWidth 불필요).
            child != null ? <View className="flex-1">{child}</View> : null,
          )
        : children;

    return (
      <View
        ref={ref}
        className={cn(
          BAR_BASE,
          LAYOUT_CLASS[layout],
          // .cta-bottom{border-top:1px solid var(--line)}
          borderTop && 'border-t border-line',
          // .cta-bottom{position:absolute;bottom:0;left:0;right:0}
          fixed && 'absolute inset-x-0 bottom-0',
          className,
        )}
        {...rest}
      >
        {content}
      </View>
    );
  },
);

BottomActionBar.displayName = 'BottomActionBar';

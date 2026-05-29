import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';

/**
 * X15 — BrandTransitionFrame pattern (커버리지 매트릭스 §X15, ds-elements §BrandTransitionFrame).
 *
 * SSOT: all-screens 와이어프레임 `.brand-frame`(S03) CSS.
 *   .brand-frame  flex; align-items:center; gap:14px
 *   .logo-side    22px / 800 / ink, letter-spacing:-.02em ('.' = accent)
 *   .dash '→'     ink-4 / 18px
 *   .portone      14px / 700 / ink-3, bg var(--bg-2), padding 6px 12px, r-sm
 *
 * 외부 SDK(예: PortOne 본인인증) 로 이동 직전, "dei. → PortOne" 의
 * 브랜드 전환을 인라인 row 로 보여준다. Text + ink-4 화살표 + ink-3/bg-2 pill 의 합성.
 *
 * 규칙(DS 강제 D-04):
 *  - 모든 색·크기·굵기·반경은 @dei/ui 토큰 className 으로만 표현(inline style / raw hex 금지).
 *  - 자체 글리프(브랜드/dot/arrow) 는 Text primitive 로, pill 라벨도 Text 로.
 *  - `.brand-frame` 의 margin(margin-top:auto / margin-bottom:30px)은 S03 화면 레이아웃이므로
 *    컴포넌트가 갖지 않는다 — 소비 화면이 className 으로 배치한다.
 */
export interface BrandTransitionFrameProps extends ViewProps {
  /** 출발 브랜드 마크. 기본 'dei'. (뒤에 accent dot 이 붙는다.) */
  brand?: string;
  /** 도착(전환 대상) 라벨. ink-3/bg-2 pill 로 표시. 기본 'PortOne'. */
  target?: string;
  /** accent dot 표시 여부(브랜드 마크 뒤 '.'). 기본 true. */
  showDot?: boolean;
  className?: string;
}

export const BrandTransitionFrame = React.forwardRef<View, BrandTransitionFrameProps>(
  function BrandTransitionFrame(
    { brand = 'dei', target = 'PortOne', showDot = true, className, accessibilityLabel, ...rest },
    ref,
  ) {
    return (
      <View
        ref={ref}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel ?? `${brand} ${target}`}
        // .brand-frame: flex row, center, gap 14px
        className={cn('flex-row items-center gap-[14px]', className)}
        {...rest}
      >
        {/* .logo-side: 22px/800 ink, '.' = accent */}
        <Text testID="brand-mark" className="text-[22px] font-extrabold tracking-tight text-ink">
          {brand}
          {showDot ? (
            <Text testID="brand-dot" className="text-[22px] font-extrabold text-accent">
              .
            </Text>
          ) : null}
        </Text>

        {/* .dash: '→' 18px ink-4 */}
        <Text testID="brand-arrow" className="text-[18px] text-ink-4">
          →
        </Text>

        {/* .portone: ink-3 14px/700, bg-2 pill, padding 6px 12px, r-sm */}
        <View testID="brand-target-pill" className="rounded-sm bg-bg-2 px-[12px] py-[6px]">
          <Text className="text-[14px] font-bold text-ink-3">{target}</Text>
        </View>
      </View>
    );
  },
);

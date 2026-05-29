import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * Card — P5 primitive.
 *
 * SSOT: all-screens 와이어프레임 (S05/S14/S16/S17/S19/S22 의 카드 표면 CSS) +
 * 커버리지 매트릭스 §P5. 모든 surface 스타일은 @dei/ui 토큰 className 으로만
 * 표현하며 raw hex / inline style 금지(DS 강제 D-04).
 *
 * variant 별 HTML 출처:
 * - default   : S16 `.info-rows` 베이스 — paper + 1px line + r-md
 * - cta-entry : S05 `.cta-entry` — paper + 1px line + r-lg + 가로 정렬 패딩
 * - compare   : S17 `.card` — r-md, 가운데 정렬, padding 14/12 (cur/now 표면색은
 *               합성 컴포넌트 CompareCard 가 className 으로 주입)
 * - info-rows : S16 `.info-rows` — default + overflow-hidden(자식 row 라운드 클립)
 * - section   : S19 `section.sec` — 투명 그룹 컨테이너(라인/배경 없음, 세로 패딩)
 */
export type CardVariant =
  | 'default'
  | 'cta-entry'
  | 'compare'
  | 'info-rows'
  | 'section';

const variantClasses: Record<CardVariant, string> = {
  // S16 .info-rows: background paper / border 1px line / radius r-md
  default: 'bg-paper border border-line rounded-md',
  // S05 .cta-entry: paper + line, radius r-lg, 가로 배치 + 18px/20px 패딩
  'cta-entry':
    'bg-paper border border-line rounded-lg flex-row items-center gap-[14px] px-[20px] py-[18px]',
  // S17 .card: radius r-md, 가운데 정렬, padding 14px/12px (surface 색은 caller)
  compare: 'rounded-md items-center px-[12px] py-[14px]',
  // S16 .info-rows: default + overflow-hidden 으로 자식 row 모서리 클립
  'info-rows': 'bg-paper border border-line rounded-md overflow-hidden',
  // S19 section.sec: 투명 그룹 컨테이너 — 세로 패딩만
  section: 'py-[14px]',
};

export interface CardProps extends ViewProps {
  /** 카드 표면 변형. 기본값 `default`. */
  variant?: CardVariant;
}

/**
 * 디자인 시스템 Card. 항상 `View` 로 래핑되며, variant 에 따른 토큰 className 을
 * 기본 적용한 뒤 `props.className` 을 `cn()` 으로 병합(마지막 승)한다.
 */
export const Card = forwardRef<View, CardProps>(function Card(
  { variant = 'default', className, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      className={cn(variantClasses[variant], className)}
      {...rest}
    />
  );
});

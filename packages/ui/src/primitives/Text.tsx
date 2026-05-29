import * as React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '../lib/cn';

/**
 * P14 — Text primitive.
 *
 * 전 31화면의 모든 텍스트 호칭(LogoMark/BrandLogo/Caption/MicroCopy/HelperTip/
 * Eyebrow/SectionLabel/MetaText/Heading 계열…)을 단일 컴포넌트로 흡수한다.
 * SSOT: all-screens 와이어프레임의 화면 CSS (font-size / font-weight / color).
 *
 * 규칙(DS 강제):
 *  - 색·크기·굵기는 전부 @dei/ui 토큰 className 으로만 표현(inline style 금지).
 *  - 토큰 매핑은 `tokens/typography.ts`(fontSize/fontWeight)·`tokens/color.ts`(ink 스케일)
 *    가 NativeWind preset 으로 노출한 클래스(text-*, font-*)를 그대로 쓴다.
 */

export type TextVariant =
  | 'logo'
  | 'display'
  | 'h1'
  | 'h2'
  | 'body'
  | 'caption'
  | 'micro'
  | 'eyebrow'
  | 'meta';

export type TextTone = 'ink' | 'ink-2' | 'ink-3' | 'ink-4' | 'accent';

export interface TextProps extends RNTextProps {
  /** 타이포 스케일. 기본 `body`. */
  variant?: TextVariant;
  /** 색(ink 스케일 / accent). variant 기본 톤을 덮어쓴다. */
  tone?: TextTone;
  /** 숫자 정렬용 tabular-nums (카운트다운/시간/가격 등). */
  tabularNums?: boolean;
  className?: string;
}

// variant → size/weight 토큰 className (HTML 화면 CSS 의 분포를 토큰 스케일에 정렬).
//  logo    : LogoMark 64/900·BrandLogo 24/900, letter-spacing 음수 → display 스케일 + black
//  display : h1 26/800(S05)·tagline 22~26/800 → 4xl + extrabold
//  h1      : h1 24~26/800·hero 22/800 → 3xl + extrabold
//  h2      : h2 19~22/700~800·SheetTitle 15/800 → xl + bold
//  body    : sub/본문 13~15 ink-3 → base + medium
//  caption : .caption 12.5 ink-3·footnote → sm + medium
//  micro   : .micro/.helper 11.5 ink-3 → xs + medium
//  eyebrow : .kicker/.label 11/700~800 accent UPPERCASE tracking-wide → xs + extrabold
//  meta    : .meta 11~12 ink-3 weight 600(mono 계열) → xs + semibold
const VARIANT_CLASS: Record<TextVariant, string> = {
  logo: 'text-display font-black tracking-tighter',
  display: 'text-4xl font-extrabold tracking-tight',
  h1: 'text-3xl font-extrabold tracking-tight',
  h2: 'text-xl font-bold tracking-tight',
  body: 'text-base font-medium',
  caption: 'text-sm font-medium',
  micro: 'text-xs font-medium',
  eyebrow: 'text-xs font-extrabold uppercase tracking-wider',
  meta: 'text-xs font-semibold',
};

// variant 기본 톤 (HTML 의 color 분포). tone prop 으로 덮어쓸 수 있다.
const VARIANT_DEFAULT_TONE: Record<TextVariant, TextTone> = {
  logo: 'ink',
  display: 'ink',
  h1: 'ink',
  h2: 'ink',
  body: 'ink-3',
  caption: 'ink-3',
  micro: 'ink-3',
  eyebrow: 'accent',
  meta: 'ink-3',
};

const TONE_CLASS: Record<TextTone, string> = {
  ink: 'text-ink',
  'ink-2': 'text-ink-2',
  'ink-3': 'text-ink-3',
  'ink-4': 'text-ink-4',
  accent: 'text-accent',
};

export const Text = React.forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', tone, tabularNums = false, className, ...rest },
  ref,
) {
  const toneToken = tone ?? VARIANT_DEFAULT_TONE[variant];
  return (
    <RNText
      ref={ref}
      accessibilityRole={variant === 'h1' || variant === 'h2' ? 'header' : 'text'}
      className={cn(
        VARIANT_CLASS[variant],
        TONE_CLASS[toneToken],
        tabularNums && 'tabular-nums',
        className,
      )}
      {...rest}
    />
  );
});

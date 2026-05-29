import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';

import { Text } from './Text';
import { cn } from '../lib/cn';

/**
 * Button (P1) — 디자인 시스템 1순위 primitive (19화면 최다 사용).
 *
 * SSOT: all-screens 와이어프레임의 CTA CSS 전수 통합.
 *  - `ink`       : `.cta`/`.primary` — `background:var(--ink)` + `color:white` + 700 + r-md
 *                  (S02/S03f/S04/S06/S23/sCC keep/sPF·sCF primary) ※검정 배경, accent 아님
 *  - `accent`    : `background:var(--accent)` + white + 700 + r-md
 *                  (S09/S11b primary/S16/S17/S21/S18 boost)
 *  - `secondary` : `background:var(--bg-2)` + `color:var(--ink-2)` + 600 + r-md
 *                  (S03f/S07a secondary/S18 later/sCC cancel/sPF·sCF secondary)
 *  - `tertiary`  : `background:transparent` + `color:var(--ink-3)` + 600, 약한 강조 (sPF tertiary/S14 닫기)
 *  - `mini-pill` : `.cta-mini` — `background:var(--accent)` + white + 700 11.5px + r-full
 *                  padding 7/12 (S05 restrict-banner/S19 pass-card)
 *  - `glass`     : `.s11b .bottom-ctas .secondary` — `bg-glass-light`(rgba white 15%) + white + 700 + r-md
 *                  (영상 오버레이 위 CTA)
 *
 * 규칙(DS 강제 D-04): 색·반경·굵기는 전부 @dei/ui 토큰 className 으로만. inline style/raw hex 금지.
 *  - disabled: HTML `.cta-bottom button{opacity:.4}` / `.on{opacity:1}` → `opacity-40` + Pressable disabled.
 *  - 라벨은 Text primitive 로 렌더(타이포 일관) + variant 별 색/굵기 className 머지.
 */
export type ButtonVariant =
  | 'ink'
  | 'accent'
  | 'secondary'
  | 'tertiary'
  | 'mini-pill'
  | 'glass';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  /** 라벨 텍스트. */
  children: React.ReactNode;
  /** 시각 variant. 기본 `ink`(검정 배경 흰 글씨 — primary). */
  variant?: ButtonVariant;
  /** 패딩/글자 스케일. 기본 `md`. mini-pill 은 자체 스케일 사용(무시). */
  size?: ButtonSize;
  /** 가로 꽉 채움(`width:100%` CTA-bottom 계열). 기본 false. */
  fullWidth?: boolean;
  /** 비활성. HTML opacity:.4 + 터치 차단. */
  disabled?: boolean;
  className?: string;
  /** 라벨 Text 에 머지할 className. */
  textClassName?: string;
}

// variant → 컨테이너(배경/반경/정렬) className. mini-pill 은 padding/r-full 자체 보유.
const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  ink: 'bg-ink rounded-md',
  accent: 'bg-accent rounded-md',
  secondary: 'bg-bg-2 rounded-md',
  tertiary: 'bg-transparent',
  'mini-pill': 'bg-accent rounded-full self-start',
  glass: 'bg-glass-light rounded-md',
};

// variant → 라벨 색/굵기 className. (ink/accent/glass=white700, secondary=ink-2/600, tertiary=ink-3/600)
const VARIANT_LABEL: Record<ButtonVariant, string> = {
  ink: 'text-white font-bold',
  accent: 'text-white font-bold',
  secondary: 'text-ink-2 font-semibold',
  tertiary: 'text-ink-3 font-semibold',
  'mini-pill': 'text-white font-bold text-[11.5px]',
  glass: 'text-white font-bold',
};

// size → 컨테이너 패딩 (HTML CTA 패딩 분포: 기본 16~18px, sm/sPF 13px). mini-pill 제외.
const SIZE_CONTAINER: Record<ButtonSize, string> = {
  md: 'px-[18px] py-[16px]',
  sm: 'px-[13px] py-[13px]',
};

// size → 라벨 글자 크기 (md 15px / sm 13.5px). mini-pill·tertiary 는 자체 스케일.
const SIZE_LABEL: Record<ButtonSize, string> = {
  md: 'text-[15px]',
  sm: 'text-[13.5px]',
};

// mini-pill 컨테이너 패딩(.cta-mini padding:7px 12px).
const MINI_PILL_PADDING = 'px-[12px] py-[7px]';

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    variant = 'ink',
    size = 'md',
    fullWidth = false,
    disabled = false,
    className,
    textClassName,
    accessibilityRole = 'button',
    ...rest
  },
  ref,
) {
  const isMiniPill = variant === 'mini-pill';
  return (
    <Pressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={cn(
        'items-center justify-center',
        VARIANT_CONTAINER[variant],
        isMiniPill ? MINI_PILL_PADDING : SIZE_CONTAINER[size],
        fullWidth && 'w-full',
        disabled && 'opacity-40',
        className,
      )}
      {...rest}
    >
      <Text
        className={cn(
          'text-center',
          VARIANT_LABEL[variant],
          // mini-pill 은 라벨 className 에 자체 글자크기 포함 → size 라벨 스케일 미적용.
          !isMiniPill && SIZE_LABEL[size],
          textClassName,
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
});

Button.displayName = 'Button';

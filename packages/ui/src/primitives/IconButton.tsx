import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { color } from '../tokens';
import { cn } from '../lib/cn';

/**
 * IconButton (P15) — 단일 아이콘 액션 버튼.
 *
 * SSOT: all-screens 와이어프레임. variant 별 CSS 원천:
 * - `ghost`        : 투명 배경, ink 글리프 (`.nav .close/.back` 32×32, color var(--ink))
 * - `filled-circle`: `--bg-2` 채운 원형, ink 글리프 (`.s03/.s07a .x` 36×36, border-radius 50%)
 * - `glass`        : 영상 오버레이용 dark glass 원형, white 글리프 (`.s10/.s11b .top-bar .x` 36×36)
 *
 * 색은 토큰 className(`bg-bg-2`, `bg-glass-dark`) + lucide `color` prop(토큰값)으로만 처리.
 * raw hex / inline style 금지 (DS D-04).
 */
export type IconButtonVariant = 'ghost' | 'filled-circle' | 'glass';
export type IconButtonSize = 32 | 36;

export interface IconButtonProps extends Omit<PressableProps, 'children'> {
  /** lucide-react-native 아이콘 컴포넌트 (예: `import { X } from 'lucide-react-native'`). */
  glyph: LucideIcon;
  /** 시각 variant. 기본 `ghost`. */
  variant?: IconButtonVariant;
  /** 터치 타깃 한 변 길이(px). 기본 32. filled-circle/glass 는 36 권장. */
  size?: IconButtonSize;
  /** 아이콘 글리프 픽셀 크기. 기본 18 (HTML font-size:18px / svg 18px). */
  iconSize?: number;
  /** 접근성 라벨 (예: '닫기', '뒤로'). */
  accessibilityLabel?: string;
  className?: string;
}

const variantContainer: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent',
  'filled-circle': 'bg-bg-2 rounded-full',
  glass: 'bg-glass-dark rounded-full',
};

// lucide 아이콘은 SVG stroke 라 className 으로 색이 안 먹는다 → 토큰값을 color prop 으로.
// glass 글리프는 영상 위 대비를 위해 흰색 — `paper`(=#FFFFFF) 토큰 사용 (raw hex 금지).
const variantGlyphColor: Record<IconButtonVariant, string> = {
  ghost: color.ink,
  'filled-circle': color.ink,
  glass: color.paper,
};

// 터치 타깃 치수(32|36)는 토큰 스케일 밖 → NativeWind 임의값 className 으로 처리(inline style 금지).
const sizeBox: Record<IconButtonSize, string> = {
  32: 'w-[32px] h-[32px]',
  36: 'w-[36px] h-[36px]',
};

export const IconButton = forwardRef<View, IconButtonProps>(function IconButton(
  {
    glyph: Glyph,
    variant = 'ghost',
    size = 32,
    iconSize = 18,
    accessibilityLabel,
    className,
    ...rest
  },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'items-center justify-center',
        sizeBox[size],
        variantContainer[variant],
        className,
      )}
      {...rest}
    >
      <Glyph color={variantGlyphColor[variant]} size={iconSize} />
    </Pressable>
  );
});

IconButton.displayName = 'IconButton';

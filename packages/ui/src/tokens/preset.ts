// NativeWind / Tailwind preset — 토큰을 className 으로 노출하는 SSOT.
// 화면은 이 preset 이 만든 토큰 클래스(bg-accent, text-ink-3, rounded-md 등)만 쓴다.
// tailwind.config.js 가 `presets: [require('@dei/ui/tokens/preset')]` 로 extend.
import type { Config } from 'tailwindcss';
import { color } from './color';
import { radius } from './radius';
import { fontSize, fontWeight, fontFamily } from './typography';
import { spacing } from './spacing';

// radius 토큰 → tailwind borderRadius (px → 문자열)
const borderRadius = Object.fromEntries(
  Object.entries(radius).map(([k, v]) => [k, v === 9999 ? '9999px' : `${v}px`]),
) as Record<string, string>;

const tailwindFontSize = Object.fromEntries(
  Object.entries(fontSize).map(([k, v]) => [k, `${v}px`]),
) as Record<string, string>;

const tailwindSpacing = Object.fromEntries(
  Object.entries(spacing).map(([k, v]) => [k, `${v}px`]),
) as Record<string, string>;

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: { ...color },
      borderRadius,
      fontSize: tailwindFontSize,
      fontWeight: { ...fontWeight } as Record<string, string>,
      fontFamily: { sans: [fontFamily.sans], mono: [fontFamily.mono] },
      spacing: tailwindSpacing,
    },
  },
};

export default preset;
module.exports = preset;

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
// tailwind.config.js 는 CJS 라 `require('@dei/ui/tokens/preset')` 로 default 를
// 직접 받는다. 단 ESM 번들(브라우저 e2e 하네스 등)에서는 `module` 이 없으므로
// guard — 없으면 no-op(이미 위 `export default` 로 충분).
if (typeof module !== 'undefined' && (module as { exports?: unknown }).exports) {
  (module as { exports: unknown }).exports = preset;
}

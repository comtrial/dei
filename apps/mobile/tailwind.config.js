/** @type {import('tailwindcss').Config} */
// v4 디자인 시스템: 토큰 SSOT 는 @dei/ui. 화면은 여기 preset 이 만든 토큰
// 클래스(bg-accent, text-ink-3, rounded-md 등)만 사용한다 (raw 스타일 ESLint 금지).
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // @dei/ui 의 컴포넌트도 스캔 (workspace 경로)
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset'), require('@dei/ui/tokens/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};

// 타이포 토큰 — SSOT: HTML `:root` --font/--font-mono + 화면 CSS 의 size/weight 분포.
// 앱 심사 대응으로 화면 CSS 기준에서 +2px 상향했다. RN 은 fontFamily 에 등록된
// Pretendard 패밀리명을 쓴다.
export const fontFamily = {
  // --font: 'Pretendard JP Variable','Pretendard JP','Pretendard Variable','Pretendard',-apple-system
  sans: 'Pretendard JP Variable',
  mono: 'SF Mono', // --font-mono: "SF Mono",Menlo,monospace
} as const;

// 화면 CSS 에 등장한 폰트 사이즈 스케일 (px, 사용빈도 높은 순으로 의미 부여)
export const fontSize = {
  '2xs': 11,
  xs: 13, // 캡션/태그
  sm: 15, // 보조 본문 (최빈)
  base: 16, // 본문 — 심사 기준상 기본체 14pt 초과 유지
  md: 17, // 입력/CTA
  lg: 20, // 소제목
  xl: 22,
  '2xl': 24, // 화면 헤딩
  '3xl': 26, // 큰 헤딩
  '4xl': 28,
  display: 38, // splash 로고
} as const;

// 화면 CSS 에 등장한 weight (HTML 그대로)
export const fontWeight = {
  medium: '500',
  semibold: '600',
  bold: '700', // 최빈
  extrabold: '800',
  black: '900', // 로고
} as const;

export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;

// 타이포 토큰 — SSOT: HTML `:root` --font/--font-mono + 화면 CSS 의 size/weight 분포.
// 값(px)은 HTML 그대로. RN 은 fontFamily 에 등록된 Pretendard 패밀리명을 쓴다.
export const fontFamily = {
  // --font: 'Pretendard JP Variable','Pretendard JP','Pretendard Variable','Pretendard',-apple-system
  sans: 'Pretendard JP Variable',
  mono: 'SF Mono', // --font-mono: "SF Mono",Menlo,monospace
} as const;

// 화면 CSS 에 등장한 폰트 사이즈 스케일 (px, 사용빈도 높은 순으로 의미 부여)
export const fontSize = {
  '2xs': 9,
  xs: 11, // 캡션/태그
  sm: 13, // 보조 본문 (최빈)
  base: 14, // 본문
  md: 15, // 입력/CTA
  lg: 18, // 소제목
  xl: 20,
  '2xl': 22, // 화면 헤딩
  '3xl': 24, // 큰 헤딩
  '4xl': 26,
  display: 36, // splash 로고
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

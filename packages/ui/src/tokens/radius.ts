// radius 토큰 — SSOT: HTML `:root` --r-* (값 그대로)
export const radius = {
  sm: 10,
  md: 14, // 가장 빈번 (인풋/카드/버튼/배너)
  lg: 20, // cta-entry 카드 / 모달
  xl: 24, // 바텀시트 상단
  full: 9999, // pill / 칩 / 원형
} as const;

export type RadiusToken = keyof typeof radius;

// spacing 토큰 — HTML 화면 CSS 의 padding/gap 분포를 4px 그리드로 정규화.
// (HTML 은 spacing 변수를 따로 두지 않으나, 화면이 일관되게 쓰는 값 묶음)
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16, // 화면 좌우 여백 최빈
  5: 20,
  6: 24, // 카드/시트 내부 여백 최빈
  8: 32,
  10: 40,
} as const;

export type SpacingToken = keyof typeof spacing;

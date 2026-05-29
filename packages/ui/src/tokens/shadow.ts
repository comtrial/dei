// shadow 토큰 — SSOT: HTML `:root` --shadow-1 + 화면 CSS 의 box-shadow 사용처.
// RN 은 box-shadow 문자열 대신 shadow* / elevation 을 쓰므로 양쪽 표현을 둔다.
// 값(offset/blur/opacity)은 HTML 그대로.
export const shadow = {
  // --shadow-1: 0 1px 2px rgba(0,0,0,.04) — 카드/배너 기본
  1: {
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    rn: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  },
  // 칩/작은 떠있는 요소: 0 2px 6px rgba(0,0,0,.08)
  2: {
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    rn: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  },
  // 시트/팝오버: 0 8px 24px rgba(0,0,0,.16)
  pop: {
    boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
    rn: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8 },
  },
  // device 프레임: 0 16px 40px rgba(0,0,0,.12)
  device: {
    boxShadow: '0 16px 40px rgba(0,0,0,0.12)',
    rn: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.12, shadowRadius: 40, elevation: 16 },
  },
} as const;

export type ShadowToken = keyof typeof shadow;

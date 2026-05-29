// 색 토큰 — SSOT: all-screens 와이어프레임 `:root` (HTML 값 그대로, 임의 변경 금지)
export const color = {
  // 표면 / 배경 (surface)
  bg: '#FFFFFF',
  paper: '#FFFFFF',
  'bg-2': '#F4F4F6',
  'bg-3': '#FAFAFB',

  // ink 스케일 (텍스트 / 전경)
  ink: '#191919',
  'ink-2': '#3D3D44',
  'ink-3': '#76767D',
  'ink-4': '#B5B5BC',

  // 라인 (구분선)
  line: '#EDEDF0',
  'line-2': '#F0F0F3',

  // semantic — accent (브랜드 핑크)
  accent: '#FF2D6F',
  'accent-soft': '#FFE9EF',
  'accent-deep': '#E5215F',

  // semantic — status
  warn: '#C8941A',
  'warn-soft': '#FFF6D9',
  danger: '#D62D2D',
  'danger-soft': '#FFE9E9',
  info: '#2A6BD9',
  'info-soft': '#E4EEFC',
  success: '#1F8A4F',

  // glass — FullscreenVideo / 영상 오버레이 공통 (매트릭스 §3A 승격분, HTML 값 그대로)
  'glass-dark': 'rgba(0,0,0,.4)', // 어두운 영상 위 오버레이 버튼 배경 (S11/S11b .top-bar .x/.flip)
  'glass-light': 'rgba(255,255,255,.15)', // 밝은 glass CTA 배경 (S11b .bottom-ctas .secondary)
} as const;

export type ColorToken = keyof typeof color;

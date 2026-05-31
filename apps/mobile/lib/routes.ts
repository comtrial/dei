import type { Href } from 'expo-router';

/**
 * 라우트 상수 (spec §6.1)
 * ------------------------------------------------------------------
 * expo-router 의 파일경로를 한 곳에서 상수로 노출한다(typedRoutes 와 병행).
 * 화면 전환·게이트는 raw 경로 문자열 대신 이 상수를 참조한다. 딥링크 스킴은
 * `dei://` (app.json scheme).
 *
 * 값은 `Href` 로 타입을 고정한다 — Phase 6 에서 모든 화면 파일이 생기면
 * typedRoutes 가 실제 라우트로 검증하며, 여기 상수는 그대로 유효하다.
 *
 * 그룹: (auth) 비로그인 / (onboarding) 가입 멀티스텝 / (app) 로그인 메인.
 */
export const ROUTES = {
  // 진입
  splash: '/', // S01 — 5분기 라우팅 부트스트랩

  // (auth) — 비로그인
  terms: '/(auth)/terms', // S02
  verify: '/(auth)/verify', // S03
  verifyFailed: '/(auth)/verify-failed', // S03f

  // (onboarding) — 가입 멀티스텝
  profileStep1: '/(onboarding)/profile/step1', // S04
  profileStep2: '/(onboarding)/profile/step2', // S04b
  profileStep3: '/(onboarding)/profile/step3', // S04c

  // (app) — 로그인 메인
  home: '/(app)/home', // S05
  teamNew: '/(app)/team/new', // S06
  permissionNotification: '/(app)/permission/notification', // S07a
  permissionCamera: '/(app)/permission/camera', // S11a
  queue: '/(app)/queue', // S07 / S09
  matchCancelConfirm: '/(app)/match/cancel-confirm', // S08
  matchFailed: '/(app)/match/failed', // S09
  booster: '/(app)/booster', // S17
  boosterFailed: '/(app)/booster-failed', // S18
  myProfile: '/(app)/my-profile', // S19
  settingsNotifications: '/(app)/settings/notifications', // S22
  settingsWithdraw: '/(app)/settings/withdraw', // S20
  support: '/(app)/support', // S23
  reportBlock: '/(app)/report/block-report', // S15
  // 값은 Href 로 노출한다. Phase 6 에서 화면 파일이 모두 생기면 typedRoutes 가
  // 이 경로들을 실제 라우트로 인식한다(런타임상 항상 유효한 경로).
} as unknown as Record<RouteKey, Href>;

type RouteKey =
  | 'splash'
  | 'terms'
  | 'verify'
  | 'verifyFailed'
  | 'profileStep1'
  | 'profileStep2'
  | 'profileStep3'
  | 'home'
  | 'teamNew'
  | 'permissionNotification'
  | 'permissionCamera'
  | 'queue'
  | 'matchCancelConfirm'
  | 'matchFailed'
  | 'booster'
  | 'boosterFailed'
  | 'myProfile'
  | 'settingsNotifications'
  | 'settingsWithdraw'
  | 'support'
  | 'reportBlock';

/** 동적 방 라우트(roomId 주입). 반환값은 Href(typedRoutes 와 호환). */
export const roomRoutes = {
  index: (roomId: string): Href => `/(app)/room/${roomId}` as Href, // S10/S13
  chat: (roomId: string): Href => `/(app)/room/${roomId}/chat` as Href, // S13a (A)
  upload: (roomId: string): Href => `/(app)/room/${roomId}/upload` as Href, // S11/S11b (C)
  members: (roomId: string): Href => `/(app)/room/${roomId}/members` as Href, // S14
  video: (roomId: string, videoId: string): Href =>
    `/(app)/room/${roomId}/video/${videoId}` as Href, // S13b
  leaveConfirm: (roomId: string): Href => `/(app)/room/${roomId}/leave-confirm` as Href, // S16
};

export const reportRoutes = {
  category: (targetId: string): Href => `/(app)/report/${targetId}` as Href, // S21
};

export type RouteGroup = 'auth' | 'onboarding' | 'app';

/** pathname 이 어느 라우트 그룹인지 판별(게이트용). */
export function routeGroupOf(pathname: string): RouteGroup | null {
  if (pathname.startsWith('/(auth)') || pathname.startsWith('/terms') || pathname.startsWith('/verify')) {
    return 'auth';
  }
  if (pathname.includes('(onboarding)') || pathname.startsWith('/profile')) {
    return 'onboarding';
  }
  if (pathname.includes('(app)')) {
    return 'app';
  }
  return null;
}

import type { Database } from '@dei/api';

/**
 * 라우트 단일 source of truth.
 *
 * Phase 1 정리: 옛 도메인 엔트리(discovery/likes/matched/matches/messages/chat*)
 * 제거. Phase 3 에서 새 도메인 엔트리(room/group/booster/solo-join) 추가 예정.
 */
export const ROUTES = {
  root: '/',
  welcome: '/welcome',
  terms: '/terms',
  termsDetail: '/terms-detail',
  phone: '/phone',
  accountStatus: '/account-status',
  profile: '/profile',
  logIntro: '/log-intro',
  firstVideo: '/record',
  home: '/home',
  record: '/record',
  result: '/result',
  logDetail: '/log-detail',
  settings: '/settings',
  myProfile: '/my-profile',
  profiles: '/profiles',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export type Eligibility =
  Database['public']['Functions']['get_my_eligibility']['Returns'][number];

const APP_ROUTES = new Set<string>([
  ROUTES.home,
  ROUTES.record,
  ROUTES.result,
  ROUTES.logDetail,
  ROUTES.settings,
  ROUTES.myProfile,
]);

const ONBOARDING_ROUTES = new Set<string>([
  ROUTES.profile,
  ROUTES.logIntro,
  ROUTES.firstVideo,
]);

const AUTH_ROUTES = new Set<string>([
  ROUTES.welcome,
  ROUTES.terms,
  ROUTES.termsDetail,
  ROUTES.phone,
  ROUTES.accountStatus,
]);

export const profileRoute = (userId: string): string => `${ROUTES.profiles}/${userId}`;

export const isAppRoute = (pathname: string) =>
  APP_ROUTES.has(pathname) ||
  pathname.startsWith(`${ROUTES.profiles}/`) ||
  [...APP_ROUTES].some((route) => pathname.startsWith(`${route}/`));

export const isAuthRoute = (pathname: string) => AUTH_ROUTES.has(pathname);

export const isOnboardingRoute = (pathname: string) => ONBOARDING_ROUTES.has(pathname);

export const routeForEligibility = (eligibility: Eligibility): AppRoute => {
  if (eligibility.account_state !== 'active') {
    return ROUTES.accountStatus;
  }

  switch (eligibility.next_step) {
    case 'terms':
      return ROUTES.terms;
    case 'phone':
    case 'identity_verification':
      return ROUTES.phone;
    case 'profile':
      return ROUTES.profile;
    case 'log_intro':
      return ROUTES.logIntro;
    case 'first_video':
      return ROUTES.firstVideo;
    // 'video_review'(검수 승인 대기) 단계는 폐지됨 — 첫 영상 업로드 시 즉시 complete.
    // enum 잔재 또는 과거 상태 대비 방어적으로 홈으로 보낸다.
    case 'video_review':
      return ROUTES.home;
    case 'complete':
      return ROUTES.home;
    default:
      return ROUTES.terms;
  }
};

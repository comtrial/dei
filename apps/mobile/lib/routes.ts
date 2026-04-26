import type { Database } from '@dei/api';

export const ROUTES = {
  root: '/',
  welcome: '/welcome',
  signIn: '/sign-in',
  otp: '/otp',
  terms: '/terms',
  termsDetail: '/terms-detail',
  phone: '/phone',
  accountStatus: '/account-status',
  profile: '/profile',
  firstVideo: '/first-video',
  videoReview: '/video-review',
  discovery: '/discovery',
  matches: '/matches',
  messages: '/messages',
  settings: '/settings',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export type Eligibility =
  Database['public']['Functions']['get_my_eligibility']['Returns'][number];

const APP_ROUTES = new Set<string>([
  ROUTES.discovery,
  ROUTES.matches,
  ROUTES.messages,
  ROUTES.settings,
]);

const ONBOARDING_ROUTES = new Set<string>([
  ROUTES.profile,
  ROUTES.firstVideo,
  ROUTES.videoReview,
]);

const AUTH_ROUTES = new Set<string>([
  ROUTES.welcome,
  ROUTES.signIn,
  ROUTES.otp,
  ROUTES.terms,
  ROUTES.termsDetail,
  ROUTES.phone,
  ROUTES.accountStatus,
]);

export const isAppRoute = (pathname: string) => APP_ROUTES.has(pathname);

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
    case 'first_video':
      return ROUTES.firstVideo;
    case 'video_review':
      return ROUTES.videoReview;
    case 'complete':
      return ROUTES.discovery;
    default:
      return ROUTES.terms;
  }
};

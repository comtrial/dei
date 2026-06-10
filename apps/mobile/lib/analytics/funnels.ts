/**
 * 4대 퍼널 SSOT (design 2026-06-07).
 * ------------------------------------------------------------------
 * 퍼널 = 순서 있는 step + 동일인(identify) + 시간 창. 각 step 은
 * ANALYTICS_EVENTS 의 "키"(런타임 문자열 아님)를 참조한다 — taxonomy 가 바뀌면
 * 여기 키가 컴파일 에러로 깨져 퍼널 정의 표류를 막는다.
 *
 * 이 파일이 "퍼널이란 무엇인가"의 단일 진실원천이다. contract 테스트
 * (__tests__/funnel-contract.test.ts)·실PostHog e2e·PostHog 대시보드 정의가
 * 모두 이 정의를 따른다.
 */
import { type AnalyticsEventKey } from '@/lib/analytics-taxonomy';

export interface FunnelDef {
  id: 'activation' | 'match' | 'engagement' | 'monetization';
  title: string;
  /** 순서 있는 step. 각 원소는 ANALYTICS_EVENTS 의 키. 위→아래 = 퍼널 위→아래. */
  steps: AnalyticsEventKey[];
}

export const FUNNELS: readonly FunnelDef[] = [
  {
    id: 'activation',
    title: 'Activation (가입→온보딩→첫 진입)',
    steps: [
      'app_opened',
      'terms_agreement_screen_entered',
      'phone_verification_succeeded',
      'onboarding_completed',
      'home_entered_waiting',
    ],
  },
  {
    id: 'match',
    title: 'Match (큐 등록→방 입장)',
    steps: [
      'home_entered_waiting',
      'team_queue_registered',
      'room_matched',
      'room_preview_entered_blurred',
      'room_joined_unblurred',
    ],
  },
  {
    id: 'engagement',
    title: 'Engagement (방 입장→영상/대화) · North Star 후보',
    steps: [
      'room_joined_unblurred',
      'video_capture_entered',
      'video_uploaded',
      'room_chat_opened',
    ],
  },
  {
    id: 'monetization',
    title: 'Monetization (바로 매치 결제 신호)',
    steps: [
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ],
  },
] as const;

/** 4대 퍼널에 등장하는 모든 spine 이벤트 키(중복 제거). contract 테스트가 검증. */
export const FUNNEL_EVENT_KEYS: readonly AnalyticsEventKey[] = Array.from(
  new Set(FUNNELS.flatMap((f) => f.steps)),
);

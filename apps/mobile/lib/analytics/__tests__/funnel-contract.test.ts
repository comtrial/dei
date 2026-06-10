import { describe, it, expect } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { FUNNELS, FUNNEL_EVENT_KEYS } from '@/lib/analytics/funnels';

describe('funnel contract', () => {
  it('4대 퍼널이 정의돼 있고 id 가 유일하다', () => {
    const ids = FUNNELS.map((f) => f.id);
    expect(ids).toEqual(['activation', 'match', 'engagement', 'monetization']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('각 퍼널은 최소 2개 step (퍼널 성립 요건)을 가진다', () => {
    for (const f of FUNNELS) {
      expect(f.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('모든 step 키가 ANALYTICS_EVENTS 에 실존한다', () => {
    for (const f of FUNNELS) {
      for (const key of f.steps) {
        expect(ANALYTICS_EVENTS[key], `${f.id} step "${key}" 미존재`).toBeDefined();
      }
    }
  });

  it('신규 spine 이벤트 8건이 taxonomy 에 등록돼 있다', () => {
    const required = [
      'app_opened',
      'phone_verification_succeeded',
      'onboarding_completed',
      'room_matched',
      'video_uploaded',
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ] as const;
    for (const key of required) {
      expect(ANALYTICS_EVENTS[key], `spine "${key}" 누락`).toBeDefined();
    }
  });

  it('spine 이벤트는 F##: prefix 규칙을 따른다', () => {
    const spine = [
      'app_opened',
      'phone_verification_succeeded',
      'onboarding_completed',
      'room_matched',
      'video_uploaded',
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ] as const;
    for (const key of spine) {
      expect(ANALYTICS_EVENTS[key]).toMatch(/^F\d+:/);
    }
  });

  it('FUNNEL_EVENT_KEYS 는 4대 퍼널의 모든 step 을 중복 없이 포함한다', () => {
    const fromFunnels = new Set(FUNNELS.flatMap((f) => f.steps));
    expect(new Set(FUNNEL_EVENT_KEYS)).toEqual(fromFunnels);
    expect(FUNNEL_EVENT_KEYS.length).toBe(fromFunnels.size); // 중복 없음
  });
});

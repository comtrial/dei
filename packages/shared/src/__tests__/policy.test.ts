import { describe, expect, it } from 'vitest';

import { POLICY, REPORT_CATEGORIES } from '../policy';

describe('policy (L2 config SSOT)', () => {
  describe('autoKick.thresholdFor — ceil((n-1)/2) (dei-ver2 D9)', () => {
    it('6인 방 → 대상 제외 5명 중 3명', () => {
      expect(POLICY.autoKick.thresholdFor(6)).toBe(3);
    });

    it('표 전체: n=2..8', () => {
      const got = [2, 3, 4, 5, 6, 7, 8].map((n) => POLICY.autoKick.thresholdFor(n));
      // (n-1)/2 올림: 1,1,2,2,3,3,4
      expect(got).toEqual([1, 1, 2, 2, 3, 3, 4]);
    });
  });

  it('신고 카테고리 6종 + other 포함 (D10)', () => {
    expect(REPORT_CATEGORIES).toHaveLength(6);
    expect(REPORT_CATEGORIES.map((c) => c.code)).toContain('other');
  });

  it('새벽 알림 차단 0~7 KST (D3)', () => {
    expect(POLICY.notifications.quietHours).toEqual({ startHourKst: 0, endHourKst: 7 });
    // 사용자 액션 직접 트리거는 예외
    expect(POLICY.notifications.quietHoursExempt).toContain('whisper_mention');
  });

  it('방 수명 7일 · 블러게이트 24h · 큐 만료 24h (D6/D8/D5)', () => {
    expect(POLICY.room.autoExpireDays).toBe(7);
    expect(POLICY.blurGate.visibilityWindowHours).toBe(24);
    expect(POLICY.matching.queueExpiryHours).toBe(24);
  });

  it('가격은 product id 만(하드코딩 가격 금지, D11)', () => {
    expect(POLICY.payment.instantRematchProductId).toBe('booster_instant_rematch_v1');
    expect(POLICY.payment).not.toHaveProperty('price');
  });

  it('팀 최대 5명 · 19+ 게이트', () => {
    expect(POLICY.team.maxMembers).toBe(5);
    expect(POLICY.identity.minAge).toBe(19);
  });
});

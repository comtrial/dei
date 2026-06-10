import { describe, expect, it } from 'vitest';

import {
  getKstHour,
  getCurrentHourSlotKst,
  isQuietHourKst,
  hourSlotLabel,
  formatTimeStripSlots,
  kstDateKey,
} from '../timeOfDay';

describe('getKstHour', () => {
  it('UTC 05:00 → KST 14:00', () => {
    const utc5 = new Date('2026-05-30T05:00:00Z');
    expect(getKstHour(utc5)).toBe(14);
  });

  it('UTC 15:00 → KST 00:00 (자정)', () => {
    const utc15 = new Date('2026-05-30T15:00:00Z');
    expect(getKstHour(utc15)).toBe(0);
  });

  it('UTC 22:30 → KST 07:30 → hour=7', () => {
    const utc22_30 = new Date('2026-05-30T22:30:00Z');
    expect(getKstHour(utc22_30)).toBe(7);
  });
});

describe('getCurrentHourSlotKst', () => {
  it('0~23 범위 반환', () => {
    const h = getCurrentHourSlotKst();
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });
});

describe('isQuietHourKst', () => {
  it('0~6 = quiet (POLICY 기본 0~7)', () => {
    for (let h = 0; h < 7; h++) {
      expect(isQuietHourKst(h)).toBe(true);
    }
  });

  it('7 = 활동 시간 (endHourKst=7 exclusive)', () => {
    expect(isQuietHourKst(7)).toBe(false);
  });

  it('23 = 활동 시간', () => {
    expect(isQuietHourKst(23)).toBe(false);
  });
});

describe('hourSlotLabel', () => {
  it('한 자리 → 0 패딩', () => {
    expect(hourSlotLabel(0)).toBe('00');
    expect(hourSlotLabel(7)).toBe('07');
  });

  it('두 자리 → 그대로', () => {
    expect(hourSlotLabel(14)).toBe('14');
    expect(hourSlotLabel(23)).toBe('23');
  });
});

describe('kstDateKey', () => {
  it('UTC 05:00 → KST 같은 날 14:00 → 그 날 키', () => {
    const ms = new Date('2026-05-30T05:00:00Z').getTime();
    expect(kstDateKey(ms)).toBe('2026-05-30');
  });

  it('UTC 15:00 → KST 다음 날 00:00 → 날짜 넘어감', () => {
    const ms = new Date('2026-05-30T15:00:00Z').getTime();
    expect(kstDateKey(ms)).toBe('2026-05-31');
  });

  it('UTC 14:59 → KST 23:59 → 아직 같은 날', () => {
    const ms = new Date('2026-05-30T14:59:00Z').getTime();
    expect(kstDateKey(ms)).toBe('2026-05-30');
  });

  it('월/일 0 패딩', () => {
    const ms = new Date('2026-01-05T01:00:00Z').getTime();
    expect(kstDateKey(ms)).toBe('2026-01-05');
  });

  it('UTC 자정 직전 23:00 → KST 다음 날 08:00', () => {
    const ms = new Date('2026-12-31T23:00:00Z').getTime();
    expect(kstDateKey(ms)).toBe('2027-01-01');
  });
});

describe('formatTimeStripSlots', () => {
  it('range=3 → 7개 슬롯', () => {
    const slots = formatTimeStripSlots(14, 3);
    expect(slots).toHaveLength(7);
  });

  it('중앙 슬롯 isNow=true', () => {
    const slots = formatTimeStripSlots(14, 3);
    const nowSlot = slots.find((s) => s.isNow);
    expect(nowSlot?.hour).toBe(14);
  });

  it('0~23 wrap — currentHour=1, range=3 → 22,23,0,1,2,3,4', () => {
    const slots = formatTimeStripSlots(1, 3);
    expect(slots.map((s) => s.hour)).toEqual([22, 23, 0, 1, 2, 3, 4]);
  });

  it('quiet 슬롯 isQuiet=true', () => {
    const slots = formatTimeStripSlots(3, 3);
    const quietSlots = slots.filter((s) => s.isQuiet);
    expect(quietSlots.length).toBeGreaterThan(0);
    for (const s of quietSlots) {
      expect(s.hour).toBeLessThan(7);
    }
  });
});

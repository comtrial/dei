import { describe, expect, it } from 'vitest';

import { getDailyLogProgress, type TodayLog } from '@/lib/dailyLog';

describe('dailyLog', () => {
  it('matches the database rule: three unique hour slots complete a daily log', () => {
    const logs: TodayLog[] = [
      {
        hour_slot: 14,
        id: 'day-14',
        recorded_at: '2026-05-12T14:00:00.000+09:00',
      },
      {
        hour_slot: 15,
        id: 'day-15',
        recorded_at: '2026-05-12T15:00:00.000+09:00',
      },
      {
        hour_slot: 16,
        id: 'day-16',
        recorded_at: '2026-05-12T16:00:00.000+09:00',
      },
      {
        hour_slot: 15,
        id: 'same-hour',
        recorded_at: '2026-05-12T15:30:00.000+09:00',
      },
    ];

    expect(getDailyLogProgress(logs)).toEqual({
      completedSlots: ['낮'],
      isComplete: true,
      total: 3,
    });
  });
});

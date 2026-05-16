import { describe, expect, it } from 'vitest';

import { groupProfileLogsByDate, toProfileLogItem, type ProfileLogSource } from '@/lib/profileLogs';

const resolveVideoUrl = (path: string) => `https://example.test/${path}`;

describe('profileLogs', () => {
  it('groups every uploaded log by local date regardless of daily completion', () => {
    const sources: ProfileLogSource[] = [
      {
        duration_sec: 2,
        hour_slot: 8,
        id: 'morning',
        recorded_at: '2026-05-12T08:00:00.000+09:00',
        video_url: 'logs/morning.mp4',
      },
      {
        duration_sec: 2,
        hour_slot: 18,
        id: 'evening',
        recorded_at: '2026-05-12T18:00:00.000+09:00',
        video_url: 'logs/evening.mp4',
      },
      {
        duration_sec: 2,
        hour_slot: 11,
        id: 'yesterday',
        recorded_at: '2026-05-11T11:00:00.000+09:00',
        video_url: 'logs/yesterday.mp4',
      },
    ];
    const logs = sources.map((log) => toProfileLogItem(log, resolveVideoUrl));

    const days = groupProfileLogsByDate(logs);

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      completedLogCount: 2,
      date: '2026-05-12',
      isDailyLogComplete: false,
    });
    expect(days[0]?.logs.map((log) => log.id)).toEqual(['evening', 'morning']);
    expect(days[1]).toMatchObject({
      completedLogCount: 1,
      date: '2026-05-11',
      isDailyLogComplete: false,
    });
  });

  it('marks a day complete only when three or more unique hour slots exist', () => {
    const sources: ProfileLogSource[] = [
      {
        duration_sec: 2,
        hour_slot: 14,
        id: 'day-14',
        recorded_at: '2026-05-12T14:00:00.000+09:00',
        video_url: 'logs/day-14.mp4',
      },
      {
        duration_sec: 2,
        hour_slot: 15,
        id: 'day-15',
        recorded_at: '2026-05-12T15:00:00.000+09:00',
        video_url: 'logs/day-15.mp4',
      },
      {
        duration_sec: 2,
        hour_slot: 16,
        id: 'day-16',
        recorded_at: '2026-05-12T16:00:00.000+09:00',
        video_url: 'logs/day-16.mp4',
      },
      {
        duration_sec: 2,
        hour_slot: 15,
        id: 'same-hour',
        recorded_at: '2026-05-12T15:30:00.000+09:00',
        video_url: 'logs/same-hour.mp4',
      },
    ];
    const logs = sources.map((log) => toProfileLogItem(log, resolveVideoUrl));

    const [day] = groupProfileLogsByDate(logs);

    expect(day?.isDailyLogComplete).toBe(true);
    expect(day?.completedHourSlots).toEqual([14, 15, 16]);
    expect(day?.completedLogCount).toBe(3);
    expect(day?.completedSlots).toEqual(['낮']);
  });
});

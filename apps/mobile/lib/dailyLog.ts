import { getTimeOfDay } from '@/lib/timeOfDay';

export type TimeSlot = '새벽' | '오전' | '낮' | '저녁' | '밤';

export const ALL_SLOTS: TimeSlot[] = ['새벽', '오전', '낮', '저녁', '밤'];

export interface DailyLogProgress {
  completedSlots: TimeSlot[];
  total: number;
  isComplete: boolean;
}

export interface TodayLog {
  id: string;
  recorded_at: string;
  hour_slot: number;
}

export function getDailyLogProgress(todayLogs: TodayLog[]): DailyLogProgress {
  const uniqueHours = [...new Set(todayLogs.map((log) => log.hour_slot))];
  const completedSlots = [
    ...new Set(
      uniqueHours.map((hourSlot) => getTimeOfDay(hourSlot) as TimeSlot)
    ),
  ];

  return {
    completedSlots,
    total: uniqueHours.length,
    isComplete: uniqueHours.length >= 3,
  };
}

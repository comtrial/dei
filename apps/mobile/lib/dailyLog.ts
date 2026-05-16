import { getTimeOfDay } from '@/lib/timeOfDay';

export const TOTAL_DAILY_SLOTS = 24;

export type TimeSlot = '새벽' | '오전' | '낮' | '저녁' | '밤';

export interface DailyLogProgress {
  completedSlots: TimeSlot[];
  isComplete: boolean;
  recordedHours: number[];
  total: number;
}

export interface TodayLog {
  id: string;
  recorded_at: string;
  hour_slot: number;
}

export function getDailyLogProgress(todayLogs: TodayLog[]): DailyLogProgress {
  const recordedHours = [...new Set(todayLogs.map((log) => log.hour_slot))].sort((a, b) => a - b);
  const completedSlots = [
    ...new Set(recordedHours.map((hourSlot) => getTimeOfDay(hourSlot) as TimeSlot)),
  ];

  return {
    completedSlots,
    isComplete: recordedHours.length >= 3,
    recordedHours,
    total: recordedHours.length,
  };
}

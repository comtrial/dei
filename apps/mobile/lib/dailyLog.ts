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
  const uniqueSlots = [
    ...new Set(
      todayLogs.map((log) => getTimeOfDay(new Date(log.recorded_at).getHours()) as TimeSlot)
    ),
  ];
  return {
    completedSlots: uniqueSlots,
    total: uniqueSlots.length,
    isComplete: uniqueSlots.length >= 3,
  };
}

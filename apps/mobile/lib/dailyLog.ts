export const TOTAL_DAILY_SLOTS = 24;

export interface DailyLogProgress {
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
  return {
    recordedHours,
    total: recordedHours.length,
  };
}

import { getTimeOfDay } from '@/lib/timeOfDay';

export type ProfileLogSource = {
  created_at?: string | null;
  duration_sec: number;
  hour_slot: number;
  id: string;
  recorded_at: string;
  user_id?: string;
  video_url: string;
  검수_YN?: string;
  검수_상태?: string;
};

export type ProfileLogItem = {
  createdAt: string | null;
  durationSec: number;
  hourSlot: number;
  id: string;
  recordedAt: string;
  reviewStatus?: string;
  reviewYn?: string;
  slotLabel: string;
  userId?: string;
  videoPath: string;
  videoUrl: string;
};

export type ProfileLogDay = {
  completedHourSlots: number[];
  completedLogCount: number;
  completedSlots: string[];
  date: string;
  displayDate: string;
  isDailyLogComplete: boolean;
  logs: ProfileLogItem[];
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Seoul',
  year: 'numeric',
});

export function getProfileLogDateKey(recordedAt: string): string {
  const parts = seoulDateFormatter.formatToParts(new Date(recordedAt));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    const date = new Date(recordedAt);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  return `${year}-${month}-${day}`;
}

export function formatProfileLogDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${year}년 ${month}월 ${day}일`;
}

export function groupProfileLogsByDate(logs: ProfileLogItem[]): ProfileLogDay[] {
  const groups = new Map<string, ProfileLogItem[]>();

  [...logs]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .forEach((log) => {
      const dateKey = getProfileLogDateKey(log.recordedAt);
      const group = groups.get(dateKey) ?? [];
      group.push(log);
      groups.set(dateKey, group);
    });

  return [...groups.entries()].map(([date, dayLogs]) => {
    const completedHourSlots = [...new Set(dayLogs.map((log) => log.hourSlot))].sort(
      (a, b) => a - b
    );
    const completedLogCount = completedHourSlots.length;
    const completedSlots = [...new Set(dayLogs.map((log) => log.slotLabel))];

    return {
      completedHourSlots,
      completedLogCount,
      completedSlots,
      date,
      displayDate: formatProfileLogDate(date),
      isDailyLogComplete: completedLogCount >= 3,
      logs: dayLogs,
    };
  });
}

export function toProfileLogItem(
  log: ProfileLogSource,
  resolveVideoUrl: (path: string) => string
): ProfileLogItem {
  return {
    createdAt: log.created_at ?? null,
    durationSec: log.duration_sec,
    hourSlot: log.hour_slot,
    id: log.id,
    recordedAt: log.recorded_at,
    reviewStatus: log.검수_상태,
    reviewYn: log.검수_YN,
    slotLabel: getTimeOfDay(log.hour_slot),
    userId: log.user_id,
    videoPath: log.video_url,
    videoUrl: resolveVideoUrl(log.video_url),
  };
}

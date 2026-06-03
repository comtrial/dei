import { POLICY } from './policy';

export function getKstHour(date: Date = new Date()): number {
  // UTC+9 고정: getTimezoneOffset()은 로컬→UTC 분 차이(부호 반대), 9h 더해 KST 획득
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  const kstMs = utcMs + 9 * 60 * 60_000;
  return new Date(kstMs).getHours();
}

export function getCurrentHourSlotKst(): number {
  return getKstHour(new Date());
}

export function isQuietHourKst(hour: number): boolean {
  const { startHourKst, endHourKst } = POLICY.notifications.quietHours;
  if (startHourKst < endHourKst) {
    return hour >= startHourKst && hour < endHourKst;
  }
  return hour >= startHourKst || hour < endHourKst;
}

export function hourSlotLabel(hour: number): string {
  return String(hour).padStart(2, '0');
}

export interface TimeStripSlot {
  hour: number;
  label: string;
  isNow: boolean;
  isQuiet: boolean;
  isFuture: boolean;
}

export function formatTimeStripSlots(
  currentHour: number,
  range: number,
  nowHour?: number,
): TimeStripSlot[] {
  const slots: TimeStripSlot[] = [];
  for (let offset = -range; offset <= range; offset++) {
    const raw = currentHour + offset;
    const hour = ((raw % 24) + 24) % 24;
    slots.push({
      hour,
      label: hourSlotLabel(hour),
      isNow: offset === 0,
      isQuiet: isQuietHourKst(hour),
      isFuture: nowHour !== undefined && hour > nowHour,
    });
  }
  return slots;
}

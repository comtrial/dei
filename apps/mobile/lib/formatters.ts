export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days === 1) return '어제';
  return `${days}일 전`;
}

export function hoursUntil(isoString: string): number {
  return Math.max(0, Math.floor((new Date(isoString).getTime() - Date.now()) / 3_600_000));
}

export function isWithinHours(isoString: string, hours: number): boolean {
  return Date.now() - new Date(isoString).getTime() < hours * 3_600_000;
}

export function formatKoreanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getTodayKST(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function getTimeOfDay(hour: number): string {
  return `${String(hour).padStart(2, '0')}시`;
}

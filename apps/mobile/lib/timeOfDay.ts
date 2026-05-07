export function getTimeOfDay(hour: number): string {
  if (hour < 5) return '새벽';
  if (hour < 12) return '오전';
  if (hour < 17) return '낮';
  if (hour < 21) return '저녁';
  return '밤';
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getToday(date = new Date()): string {
  return toLocalDateString(date);
}

export function getYesterday(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
}

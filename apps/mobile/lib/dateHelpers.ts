export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

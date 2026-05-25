const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstDateString(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function getKstFourHourSlot(now = new Date()) {
  const kstHour = new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
  return Math.floor(kstHour / 4);
}

export function parseDateOrNow(value: string | null | undefined) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function clampLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(value)));
}

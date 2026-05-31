import { POLICY } from './policy';

export type RematchRestriction = {
  availableAt: string | null;
  remainingMs: number;
  restricted: boolean;
};

export function getRematchRestriction(
  lastRoomLeaveAt?: string | null,
  now: Date = new Date(),
): RematchRestriction {
  if (!lastRoomLeaveAt) {
    return { availableAt: null, remainingMs: 0, restricted: false };
  }

  const leaveTime = new Date(lastRoomLeaveAt).getTime();
  if (!Number.isFinite(leaveTime)) {
    return { availableAt: null, remainingMs: 0, restricted: false };
  }

  const availableAtMs = leaveTime + POLICY.matching.rematchCooldownHours * 60 * 60 * 1000;
  const remainingMs = Math.max(availableAtMs - now.getTime(), 0);

  return {
    availableAt: new Date(availableAtMs).toISOString(),
    remainingMs,
    restricted: remainingMs > 0,
  };
}

export function formatRematchCountdown(remainingMs: number) {
  const totalMinutes = Math.max(Math.ceil(remainingMs / (60 * 1000)), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

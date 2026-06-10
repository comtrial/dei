export function getRoomRematchCooldownAnchor(
  roomCreatedAt: string | null | undefined,
  fallbackLeftAt: string,
) {
  const createdAtMs = roomCreatedAt ? new Date(roomCreatedAt).getTime() : Number.NaN;
  return Number.isFinite(createdAtMs) ? roomCreatedAt! : fallbackLeftAt;
}

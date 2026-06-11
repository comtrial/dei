export function getRoomRematchCooldownAnchor(
  _roomCreatedAt: string | null | undefined,
  fallbackLeftAt: string,
) {
  // 방 나가기 재매칭 제한은 방 생성시각이 아니라 실제 이탈 시각부터 12시간이다.
  return fallbackLeftAt;
}

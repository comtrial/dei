// apps/mobile/lib/chat/scroll.ts
/** inverted FlatList: contentOffset.y ≈ 0 이 하단. 120px 이내면 '하단 근처'. */
export const NEAR_BOTTOM_PX = 120;
export function isNearBottom(offsetY: number): boolean {
  return offsetY <= NEAR_BOTTOM_PX;
}

/**
 * '새 메시지 N개' pill 증가분 계산(concurrency-misc-12).
 *
 * prev→next 사이에 새로 '추가된'(id 기준) 메시지 중 **내가 보낸 것(userId===selfId)은
 * 제외**한다. 내 낙관 전송은 자동 하단 추종 대상이라 pill 에 잡히면 안 된다.
 * 기존 메시지의 reconcile(상태/순서 변화)은 id 가 같으므로 증가에 반영되지 않는다.
 */
export function countNewMessages<T extends { id: string; userId: string }>(
  prev: T[],
  next: T[],
  selfId: string,
): number {
  const prevIds = new Set(prev.map((m) => m.id));
  return next.filter((m) => !prevIds.has(m.id) && m.userId !== selfId).length;
}

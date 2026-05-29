// apps/mobile/lib/chat/scroll.ts
/** inverted FlatList: contentOffset.y ≈ 0 이 하단. 120px 이내면 '하단 근처'. */
export const NEAR_BOTTOM_PX = 120;
export function isNearBottom(offsetY: number): boolean {
  return offsetY <= NEAR_BOTTOM_PX;
}

// apps/mobile/lib/chat/unread.ts
// 방 채팅 unread 점 판정(순수 함수).
//  - latestOthersMessageAt: "내가 안 보낸, 나에게 보이는" 메시지 중 최신 created_at(ISO). 없으면 null.
//  - lastReadAt: room_member.last_read_at(ISO). 한 번도 안 읽었으면 null.
// RLS가 가시성(귓속말·차단)을 이미 필터하므로 여기선 시각 비교만 한다.
export function hasUnread(
  latestOthersMessageAt: string | null,
  lastReadAt: string | null,
): boolean {
  if (latestOthersMessageAt == null) return false;
  if (lastReadAt == null) return true;
  return new Date(latestOthersMessageAt).getTime() > new Date(lastReadAt).getTime();
}

import type { RoomMemberLite } from '@/lib/chat/mention';

const CACHE_TTL_MS = 5 * 60 * 1000;

const roomMemberCache = new Map<
  string,
  {
    expiresAtMs: number;
    members: RoomMemberLite[];
  }
>();

function cloneMembers(members: RoomMemberLite[]) {
  return members.map((member) => ({
    ...member,
    profile: member.profile ? { ...member.profile } : undefined,
  }));
}

export function setCachedRoomChatMembers(roomId: string, members: RoomMemberLite[]) {
  roomMemberCache.set(roomId, {
    expiresAtMs: Date.now() + CACHE_TTL_MS,
    members: cloneMembers(members),
  });
}

export function getCachedRoomChatMembers(roomId: string) {
  const cached = roomMemberCache.get(roomId);
  if (!cached) return [];

  if (cached.expiresAtMs <= Date.now()) {
    roomMemberCache.delete(roomId);
    return [];
  }

  return cloneMembers(cached.members);
}

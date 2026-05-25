/**
 * Rooms-pivot 도메인 type alias.
 *
 * `@dei/api` 의 raw DB row 타입을 UI 가 쓰기 쉽게 재노출. 컬럼 추가/변경 시
 * `pnpm db:gen-types` 후 여기서도 동기화.
 */
import type {
  BoosterGrant,
  ChatMention,
  ChatMessage,
  GroupMember,
  GroupRow,
  HourlyUpload,
  MatchQueueRow,
  RoomAutoKick,
  RoomLeaveCooldown,
  RoomMember,
  RoomRow,
} from '@dei/api';

export type Room = RoomRow;
export type RoomMemberRow = RoomMember;
export type RoomAutoKickRow = RoomAutoKick;
export type RoomCooldown = RoomLeaveCooldown;

export type Group = GroupRow;
export type GroupMemberRow = GroupMember;
export type MatchQueueItem = MatchQueueRow;

export type Upload = HourlyUpload;
export type Message = ChatMessage;
export type Mention = ChatMention;

export type Booster = BoosterGrant;

// 클라가 RPC/Edge 응답을 받아 정리하는 단위
export type RoomSummary = {
  id: string;
  status: Room['status'];
  expiresAt: string;
  endedAt: string | null;
  endedReason: Room['ended_reason'];
  memberCount: number;
  activeMemberCount: number;
};

export type RoomMemberSummary = {
  roomId: string;
  profileId: string;
  status: RoomMember['status'];
  joinedAt: string;
  leftAt: string | null;
};

export type FeedCell = {
  uploadId: string;
  profileId: string;
  roomId: string;
  storagePath: string;
  thumbnailPath: string | null;
  durationMs: number;
  hourSlot: number;
  slotDate: string;
  uploadedAt: string;
};

export type ChatBubble = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  createdAt: string;
  mentions: string[];           // mentioned profile ids
  isOptimistic?: boolean;
  status?: 'sending' | 'sent' | 'failed';
};

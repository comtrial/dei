/**
 * Chat domain types.
 *
 * `packages/api/src/database.types.ts` 는 Docker 부재로 chat 테이블
 * (conversations / messages) 을 아직 포함하지 않는다 (CLAUDE.md / 작업 지시
 * "타입이 없으면 최소한의 로컬 타입 정의로 우회"). 스키마 권위 소스는
 * supabase/migrations/20260516120000_chat_conversations_messages.sql 이며
 * 아래 타입은 그 DDL 과 1:1 로 맞춘 최소 정의다. db:gen-types 가 다시
 * 돌면 `@dei/api` 의 Database 타입으로 교체할 수 있다.
 */

export type ConversationStatus = 'ACTIVE' | 'ENDED' | 'DELETED';

export type MessageStatus = 'SENT';

export interface ConversationRow {
  id: string;
  match_id: string;
  user_a_id: string;
  user_b_id: string;
  status: ConversationStatus;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  status: MessageStatus;
  deleted_at: string | null;
  created_at: string;
}

/** send_message RPC 의 returns row. */
export interface SendMessageResult {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  status: MessageStatus;
  created_at: string;
}

/** leave_conversation RPC 의 returns row. */
export interface LeaveConversationResult {
  conversation_id: string;
  match_id: string;
  other_user_id: string;
  status: 'DELETED';
}

/** UI 레이어에서 쓰는 채팅 목록 항목 (CH1). */
export interface ChatListItem {
  conversationId: string;
  otherUserId: string;
  otherNickname: string;
  /** 상대 프로필 사진 (storage signed URL). 없으면 null → 초성 fallback. */
  otherPhotoUrl: string | null;
  lastMessagePreview: string | null;
  updatedAt: string;
  status: ConversationStatus;
}

/** UI 레이어 메시지 버블 — 전송 실패 시 로컬 retry 마커 포함 (10-E). */
export interface ChatMessage {
  /** 서버 id. optimistic 버블은 임시 clientId 를 id 로 쓴다. */
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  /** 'sending' | 'sent' | 'failed' — failed 면 인라인 retry 마커 노출. */
  deliveryStatus: 'sending' | 'sent' | 'failed';
  /**
   * 실패가 재시도 가능한지. true 일 때만 "다시 시도" 마커를 노출한다
   * (PM 검증서 P0-4: BLOCKED/ENDED/INVALID/FORBIDDEN 등 비재시도 실패는
   * 마커 미노출 — 비재시도 실패는 버블 자체가 제거되므로 보통 사용 안 됨,
   * 방어적으로 false 면 마커 숨김).
   */
  retryable?: boolean;
  /** optimistic 버블 추적용 (서버 확정 시 교체). */
  clientId?: string;
}

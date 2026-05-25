/**
 * Rooms 도메인 service — Edge Function 호출 wrapper.
 *
 * 클라는 **항상 Edge Function 경로(`supabase.functions.invoke`)** 로 호출한다.
 * 직접 RPC 호출은 CLAUDE.md 규칙 9 (③ 실DB e2e 가 함수.invoke 경로 검증) 위반.
 * 모든 변경은 같은 흐름으로 — 그래야 ①배포 ②env ③auth 토큰 형식이 함께 검증됨.
 */
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

import type { RoomSummary } from './types';

type EdgeError = { error?: string; retryable?: boolean };

function unwrapEdgeError(err: unknown, fallback: string): Error & { retryable?: boolean } {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; context?: { json?: EdgeError } };
    const detail = e.context?.json?.error;
    const final = new Error(detail || e.message || fallback);
    (final as { retryable?: boolean }).retryable = e.context?.json?.retryable;
    return final;
  }
  return new Error(fallback);
}

// ============================================================================
// Message
// ============================================================================

export async function sendChatMessage(input: {
  roomId: string;
  body: string;
}): Promise<{ messageId: string }> {
  const { data, error } = await supabase.functions.invoke<{ messageId: string }>(
    'room-send-message',
    { body: input },
  );
  if (error || !data?.messageId) {
    const captured = unwrapEdgeError(error, 'failed to send message');
    logger.captureException(captured, {
      tags: { feature: 'rooms', action: 'send-message' },
      extra: { roomId: input.roomId },
    });
    throw captured;
  }
  return data;
}

// ============================================================================
// Upload
// ============================================================================

export type UploadVideoInput = {
  roomId: string;
  storagePath: string;
  thumbnailPath: string | null;
  durationMs: number;
  hourSlot: number;     // 0..23 (KST)
  slotDate: string;     // 'YYYY-MM-DD' (KST)
};

export async function uploadHourlyVideo(
  input: UploadVideoInput,
): Promise<{ uploadId: string }> {
  const { data, error } = await supabase.functions.invoke<{ uploadId: string }>(
    'room-upload-video',
    { body: input },
  );
  if (error || !data?.uploadId) {
    const captured = unwrapEdgeError(error, 'failed to upload video');
    logger.captureException(captured, {
      tags: { feature: 'rooms', action: 'upload-video' },
      extra: { roomId: input.roomId, hourSlot: input.hourSlot, slotDate: input.slotDate },
    });
    throw captured;
  }
  return data;
}

// ============================================================================
// Block / Report
// ============================================================================

export async function blockUser(input: {
  blockedId: string;
  sourceRoomId?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { error } = await supabase.functions.invoke('room-block-user', {
    body: input,
  });
  if (error) {
    const captured = unwrapEdgeError(error, 'failed to block user');
    logger.captureException(captured, {
      tags: { feature: 'rooms', action: 'block-user' },
      extra: { roomId: input.sourceRoomId ?? null },
    });
    throw captured;
  }
}

export type ReportReasonCode =
  | 'verbal_abuse'
  | 'spam'
  | 'fake_profile'
  | 'inappropriate_video'
  | 'harassment'
  | 'other';

export async function reportUser(input: {
  reportedId: string;
  reasonCode: ReportReasonCode;
  reasonDetail?: string | null;
  roomId?: string | null;
}): Promise<{ reportId: string }> {
  const { data, error } = await supabase.functions.invoke<{ reportId: string }>(
    'room-report-user',
    { body: input },
  );
  if (error || !data?.reportId) {
    const captured = unwrapEdgeError(error, 'failed to report user');
    logger.captureException(captured, {
      tags: { feature: 'rooms', action: 'report-user' },
      extra: { roomId: input.roomId ?? null, reasonCode: input.reasonCode },
    });
    throw captured;
  }
  return data;
}

// ============================================================================
// Leave
// ============================================================================

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('room-leave', {
    body: { roomId },
  });
  if (error) {
    const captured = unwrapEdgeError(error, 'failed to leave room');
    logger.captureException(captured, {
      tags: { feature: 'rooms', action: 'leave-room' },
      extra: { roomId },
    });
    throw captured;
  }
}

// ============================================================================
// Read queries — 직접 SELECT (read-only RLS 통과)
// ============================================================================

/**
 * 본인이 active member 인 방 1개 조회 (메인 홈 카드용).
 * 여러 active 방이 있으면 가장 최근 join 된 방 반환.
 */
export async function fetchMyActiveRoom(): Promise<RoomSummary | null> {
  const { data, error } = await supabase
    .from('room_members')
    .select(
      'rooms(id, status, expires_at, ended_at, ended_reason, member_count, active_member_count), joined_at',
    )
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'rooms', action: 'fetch-active-room' },
    });
    return null;
  }
  if (!data?.rooms) return null;

  const r = data.rooms as {
    id: string;
    status: 'active' | 'ended' | 'archived';
    expires_at: string;
    ended_at: string | null;
    ended_reason: string | null;
    member_count: number;
    active_member_count: number;
  };

  return {
    id: r.id,
    status: r.status,
    expiresAt: r.expires_at,
    endedAt: r.ended_at,
    endedReason: r.ended_reason as RoomSummary['endedReason'],
    memberCount: r.member_count,
    activeMemberCount: r.active_member_count,
  };
}

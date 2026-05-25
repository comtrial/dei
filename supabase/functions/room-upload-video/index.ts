// ROOMS-API · POST /functions/v1/room-upload-video
//
// 3초 영상 메타 적재. 클라가 먼저 Storage 의 `room-uploads` 버킷에 파일 업로드
// 완료 후 호출한다. RPC 가 active member 검증 + slot 중복 거부.
//
// 입력 (JSON body):
//   roomId:        uuid
//   storagePath:   string                — 'rooms/<roomId>/<profileId>/<uuid>.mp4'
//   thumbnailPath: string | null         — 'rooms/<roomId>/<profileId>/<uuid>.jpg'
//   durationMs:    number (500..3500)
//   hourSlot:      number (0..23)        — KST 시 슬롯
//   slotDate:      string ('YYYY-MM-DD')  — KST 날짜
//
// 응답:
//   200 { uploadId: uuid }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   403 { error, retryable:false }         not a room member
//   409 { error, retryable:false }         slot already used
//   500 { error, retryable:true }
//
// RPC: public.upload_hourly_video(...)
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = {
  roomId?: unknown;
  storagePath?: unknown;
  thumbnailPath?: unknown;
  durationMs?: unknown;
  hourSlot?: unknown;
  slotDate?: unknown;
};

const MIN_DURATION = 500;
const MAX_DURATION = 3500;
const SLOT_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser } = await getAuthenticatedUser(req);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }

    const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
    const thumbnailPath =
      typeof body.thumbnailPath === 'string' && body.thumbnailPath.trim().length > 0
        ? body.thumbnailPath.trim()
        : null;
    const durationMs = typeof body.durationMs === 'number' ? body.durationMs : NaN;
    const hourSlot = typeof body.hourSlot === 'number' ? body.hourSlot : NaN;
    const slotDate = typeof body.slotDate === 'string' ? body.slotDate.trim() : '';

    if (!roomId) {
      return errorResponse('roomId is required', 400, { retryable: false });
    }
    if (!storagePath) {
      return errorResponse('storagePath is required', 400, { retryable: false });
    }
    if (
      !Number.isFinite(durationMs) ||
      durationMs < MIN_DURATION ||
      durationMs > MAX_DURATION
    ) {
      return errorResponse(
        `durationMs must be ${MIN_DURATION}..${MAX_DURATION}`,
        400,
        { retryable: false },
      );
    }
    if (!Number.isInteger(hourSlot) || hourSlot < 0 || hourSlot > 23) {
      return errorResponse('hourSlot must be 0..23', 400, { retryable: false });
    }
    if (!SLOT_DATE_REGEX.test(slotDate)) {
      return errorResponse('slotDate must be YYYY-MM-DD', 400, { retryable: false });
    }

    const { data, error } = await supabaseAsUser.rpc('upload_hourly_video', {
      p_room_id: roomId,
      p_storage_path: storagePath,
      p_thumbnail_path: thumbnailPath,
      p_duration_ms: Math.round(durationMs),
      p_hour_slot: hourSlot,
      p_slot_date: slotDate,
    });

    if (error) {
      // unique constraint (slot 중복)
      if (error.code === '23505') {
        return errorResponse('hour slot already used', 409, { retryable: false });
      }
      if (error.code === '42501') {
        return errorResponse(
          error.message === 'unauthenticated' ? 'authentication required' : 'not a room member',
          error.message === 'unauthenticated' ? 401 : 403,
          { retryable: false },
        );
      }
      throw error;
    }

    return jsonResponse({ uploadId: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});

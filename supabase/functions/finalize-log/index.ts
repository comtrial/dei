// REC-API1 · POST /functions/v1/finalize-log
//
// 클라이언트가 Storage 의 logs/thumbnails 버킷에 영상/썸네일 파일을 업로드한 직후
// 호출한다. 서버 측에서 슬롯 정책 검증 → 기존 row/파일 정리 → 새 logs row insert →
// recalculate_daily_log 까지 단일 흐름으로 처리한다.
//
// **이관 이유**: 기존엔 클라가 직접 select → storage remove → row delete → upload →
// row insert → RPC 6단계를 호출. 중간에 실패하면 orphan 파일/row 가 발생할 수 있었고,
// 검수 초기 상태 ('검수_YN'='N', '검수_상태'='PENDING') / hour_slot 계산 / recorded_at
// 타임존이 모두 클라 코드에 박혀있어 정책 변경 시 앱 빌드가 필요했다. Edge 로 옮기면
// 위 룰을 서버에서 hotfix 가능하고, 클라 시계가 아닌 서버 시계로 hour_slot 을 계산해
// 일관성을 보장한다.
//
// 입력 (JSON body):
//   videoPath:        Storage 'logs' 버킷의 객체 path (필수) — 클라가 직전에 업로드 완료
//   thumbnailPath:    Storage 'thumbnails' 버킷의 객체 path (선택)
//   recordedMs:       클라가 측정한 실제 녹화 길이 (ms, 1..60000)
//
// 응답:
//   200 { logId, hourSlot, recordedAt }                       정상 저장
//   400 { error, retryable:false }                            입력 검증 실패 (재시도 무의미)
//   401 { error, retryable:false }                            인증 실패
//   500 { error, retryable:true }                             일시 장애 (클라 재시도 가능)
import { createAdminClient, getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type FinalizeLogBody = {
  videoPath?: string;
  thumbnailPath?: string | null;
  recordedMs?: number;
};

const MAX_RECORDED_MS = 60_000; // 1분 — 현 정책상 2초지만 여유 상한
const MIN_RECORDED_MS = 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { retryable: false });
  }

  try {
    // logs select/insert/delete 는 본인 row 에만 — auth.uid() 가 필요한 RLS 경로라
    // supabaseAsUser (사용자 JWT) 로 호출한다. Storage cleanup 은 storage policy 가
    // 본인 prefix 만 허용해도 admin 으로 통일하는 게 안전 (RLS 외 storage 정책 변경에
    // 영향 안 받음).
    const { supabaseAsUser, user } = await getAuthenticatedUser(req);
    const admin = createAdminClient();

    let body: FinalizeLogBody;
    try {
      body = (await req.json()) as FinalizeLogBody;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }

    const videoPath = typeof body.videoPath === 'string' ? body.videoPath.trim() : '';
    const thumbnailPath =
      typeof body.thumbnailPath === 'string' && body.thumbnailPath.trim().length > 0
        ? body.thumbnailPath.trim()
        : null;
    const recordedMs = typeof body.recordedMs === 'number' ? body.recordedMs : null;

    if (!videoPath) {
      return errorResponse('videoPath is required', 400, { retryable: false });
    }
    if (
      recordedMs === null ||
      !Number.isFinite(recordedMs) ||
      recordedMs < MIN_RECORDED_MS ||
      recordedMs > MAX_RECORDED_MS
    ) {
      return errorResponse(
        `recordedMs must be ${MIN_RECORDED_MS}..${MAX_RECORDED_MS}`,
        400,
        { retryable: false },
      );
    }

    // 서버 시계 기준 — 클라 시계가 잘못된 경우(폰 수동 조작 등)에도 슬롯 일관성 보장.
    // hour_slot 정책은 UTC 기준 hour. (기존 클라 로직과 동일한 동작 유지)
    const recordedAt = new Date();
    const hourSlot = recordedAt.getUTCHours();
    const todayUtc = recordedAt.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1) 기존 같은 슬롯 row 조회 (RLS 통과 — 본인 row 만)
    const { data: existing, error: selectError } = await supabaseAsUser
      .from('logs')
      .select('id, video_url, thumbnail_path')
      .eq('user_id', user.id)
      .eq('hour_slot', hourSlot)
      .gte('recorded_at', `${todayUtc}T00:00:00.000Z`)
      .lte('recorded_at', `${todayUtc}T23:59:59.999Z`)
      .maybeSingle();

    if (selectError) {
      return errorResponse(selectError.message, 500, { retryable: true });
    }

    // 2) 기존 row + storage 파일 정리. storage remove 실패는 비치명적 (다음 trim 으로
    //    회수 가능) — 본 row delete 가 핵심.
    if (existing) {
      const cleanupTasks: Promise<unknown>[] = [];
      if (existing.video_url) {
        cleanupTasks.push(
          admin.storage.from('logs').remove([existing.video_url]).catch((e) => {
            console.error('logs storage remove failed:', e);
          }),
        );
      }
      if (existing.thumbnail_path) {
        cleanupTasks.push(
          admin.storage
            .from('thumbnails')
            .remove([existing.thumbnail_path])
            .catch((e) => {
              console.error('thumbnails storage remove failed:', e);
            }),
        );
      }
      await Promise.all(cleanupTasks);

      const { error: deleteError } = await supabaseAsUser
        .from('logs')
        .delete()
        .eq('id', existing.id);
      if (deleteError) {
        return errorResponse(deleteError.message, 500, { retryable: true });
      }
    }

    // 3) 새 row insert.
    //   - '검수_YN'='N', '검수_상태'='PENDING' 은 운영 정책. 변경하려면 이 함수만
    //     수정/배포하면 됨 (앱 빌드 불필요 — 이관의 핵심 가치).
    //   - duration_sec 은 round (반올림) — 1초 이하 녹화도 1 로 기록.
    const { data: inserted, error: insertError } = await supabaseAsUser
      .from('logs')
      .insert({
        user_id: user.id,
        video_url: videoPath,
        thumbnail_path: thumbnailPath,
        hour_slot: hourSlot,
        duration_sec: Math.max(1, Math.round(recordedMs / 1000)),
        '검수_YN': 'N',
        '검수_상태': 'PENDING',
        recorded_at: recordedAt.toISOString(),
      })
      .select('id, hour_slot, recorded_at')
      .single();

    if (insertError || !inserted) {
      return errorResponse(
        insertError?.message ?? 'failed to insert log',
        500,
        { retryable: true },
      );
    }

    // 4) 일별 로그 재계산 (RPC). 실패해도 row insert 는 유지되므로 사용자 흐름은
    //    계속되게 한다. 재계산은 백오피스에서 수동/배치로도 가능.
    const { error: recalcError } = await supabaseAsUser.rpc('recalculate_daily_log', {
      p_user_id: user.id,
    });
    if (recalcError) {
      console.error('recalculate_daily_log failed:', recalcError.message);
    }

    return jsonResponse(
      {
        logId: inserted.id,
        hourSlot: inserted.hour_slot,
        recordedAt: inserted.recorded_at,
      },
      { status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed to finalize log';
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401, { retryable: false });
    }
    return errorResponse(msg, 500, { retryable: true });
  }
});

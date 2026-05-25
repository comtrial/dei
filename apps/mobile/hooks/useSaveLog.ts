import { logger } from '@dei/shared';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

function getVideoContentType(uri: string): string {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();

  if (extension === 'mov' || extension === 'qt') {
    return 'video/quicktime';
  }

  return 'video/mp4';
}

function getVideoExtension(uri: string): string {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();

  if (extension === 'mov' || extension === 'qt') {
    return 'mov';
  }

  return 'mp4';
}

export function useSaveLog() {
  const [loading, setLoading] = useState(false);

  const saveLog = async ({
    tempVideoUri,
    recordedMs,
  }: {
    tempVideoUri: string;
    recordedMs: number;
  }): Promise<{ success: true; logId: string | null } | { success: false; message: string }> => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) throw new Error('Not authenticated');

      const fileInfo = await FileSystem.getInfoAsync(tempVideoUri);

      if (!fileInfo.exists || !('size' in fileInfo) || !fileInfo.size) {
        throw new Error('촬영 파일이 비어 있어요. 다시 촬영해 주세요.');
      }

      // 슬롯 / 날짜는 폴백 경로에서만 사용 (Edge 는 서버 시계 기준으로 자체 계산).
      const hourSlot = new Date().getHours();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 새 영상 업로드 — RN fetch+blob 은 file:// URI 에서 size 0 Blob 버그가 있어 File API로 읽는다.
      // 기존 슬롯 row/storage 정리는 Edge Function 'finalize-log' 가 트랜잭션처럼 처리하므로
      // 클라에서 사전 정리하지 않는다 (orphan 파일 발생 위험 제거).
      const contentType = getVideoContentType(tempVideoUri);
      const ts = Date.now();
      const fileName = `${userId}/${ts}.${getVideoExtension(tempVideoUri)}`;
      const arrayBuffer = await new File(tempVideoUri).arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        throw new Error('촬영 파일을 읽을 수 없어요. 다시 촬영해 주세요.');
      }

      // 영상 업로드와 썸네일 생성/업로드를 병렬로. 썸네일 실패는 영상 저장을 막지 않는다.
      const videoUploadPromise = supabase.storage
        .from('logs')
        .upload(fileName, arrayBuffer, { contentType, upsert: false });

      const thumbnailUploadPromise = (async (): Promise<string | null> => {
        try {
          const { uri: thumbLocalUri } = await VideoThumbnails.getThumbnailAsync(
            tempVideoUri,
            { time: 0, quality: 0.7 }
          );
          const thumbBuffer = await new File(thumbLocalUri).arrayBuffer();
          if (thumbBuffer.byteLength === 0) {
            await FileSystem.deleteAsync(thumbLocalUri, { idempotent: true }).catch(
              () => undefined
            );
            return null;
          }
          const thumbName = `${userId}/${ts}.jpg`;
          const { data: thumbData, error: thumbError } = await supabase.storage
            .from('thumbnails')
            .upload(thumbName, thumbBuffer, { contentType: 'image/jpeg', upsert: false });
          await FileSystem.deleteAsync(thumbLocalUri, { idempotent: true }).catch(
            () => undefined
          );
          if (thumbError) {
            logger.captureException(thumbError, {
              tags: { feature: 'save-log-thumbnail' },
              extra: { step: 'upload', thumbName },
            });
            return null;
          }
          return thumbData?.path ?? null;
        } catch (thumbError) {
          logger.captureException(thumbError, {
            tags: { feature: 'save-log-thumbnail' },
            extra: { step: 'extract' },
          });
          return null;
        }
      })();

      const [
        { data: uploadData, error: uploadError },
        thumbnailPath,
      ] = await Promise.all([videoUploadPromise, thumbnailUploadPromise]);

      if (uploadError) throw uploadError;

      // 슬롯 정책 검증 + 기존 row/storage 정리 + 새 row insert + recalculate_daily_log 까지
      // Edge Function 'finalize-log' 가 단일 흐름으로 처리한다. Edge 가 일시 장애일 때만
      // 기존 클라이언트 6단계 흐름으로 폴백 (AGENTS.md: "Edge 우선 / RPC 폴백" 패턴).
      const edgeFinalize = await invokeFinalizeLog({
        videoPath: uploadData.path,
        thumbnailPath,
        recordedMs,
      });

      // PostHog log_recorded 의 log_id 용. Edge 응답이 우선, 폴백 시 insert 결과로 채운다.
      let logId: string | null = edgeFinalize.ok ? edgeFinalize.logId : null;

      if (!edgeFinalize.ok) {
        // 폴백: 기존 클라 로직. Edge 가 죽거나 인증 timing race 인 경우에도 사용자 흐름은
        // 막지 않는다. (이 분기는 Edge 안정화되면 제거 예정 — TODO 주석 참조)
        logger.captureException(edgeFinalize.error, {
          tags: { feature: 'save-log', step: 'edge-finalize-fallback' },
          extra: { reason: edgeFinalize.reason },
        });

        logId = await fallbackFinalizeOnClient({
          userId,
          videoPath: uploadData.path,
          thumbnailPath,
          hourSlot,
          today,
          recordedMs,
        });
      }

      try {
        await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
      } catch (cleanupError) {
        logger.captureException(cleanupError, {
          tags: { feature: 'daily-log-cleanup' },
          extra: { tempVideoUri },
        });
      }

      return { success: true, logId };
    } catch (e) {
      logger.captureException(e, {
        tags: { feature: 'save-log' },
        extra: { hasTempVideoUri: !!tempVideoUri, recordedMs },
      });
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  return { saveLog, loading };
}

// ----------------------------------------------------------------------
// Edge Function 'finalize-log' 호출 + 폴백 헬퍼
// ----------------------------------------------------------------------
//
// AGENTS.md 의 "Edge 우선 / 기존 RPC·클라 로직 폴백" 패턴.
// Edge 가 정상 응답하면 그 결과를 신뢰하고, 일시 장애일 때만 기존 클라 로직 (select →
// remove → delete → insert → RPC) 을 그대로 실행한다. Edge 가 안정화되면 폴백을 제거.

type FinalizeLogInvoke =
  | { ok: true; logId: string }
  | { ok: false; reason: 'invoke-failed' | 'edge-error'; error: unknown };

async function invokeFinalizeLog(args: {
  videoPath: string;
  thumbnailPath: string | null;
  recordedMs: number;
}): Promise<FinalizeLogInvoke> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      logId?: string;
      hourSlot?: number;
      recordedAt?: string;
      error?: string;
    }>('finalize-log', {
      body: {
        videoPath: args.videoPath,
        thumbnailPath: args.thumbnailPath,
        recordedMs: args.recordedMs,
      },
    });

    if (error) {
      return { ok: false, reason: 'invoke-failed', error };
    }
    if (data?.error || !data?.logId) {
      return { ok: false, reason: 'edge-error', error: data?.error ?? 'no logId' };
    }
    return { ok: true, logId: data.logId };
  } catch (e) {
    return { ok: false, reason: 'invoke-failed', error: e };
  }
}

async function fallbackFinalizeOnClient(args: {
  userId: string;
  videoPath: string;
  thumbnailPath: string | null;
  hourSlot: number;
  today: string;
  recordedMs: number;
}): Promise<string | null> {
  const { userId, videoPath, thumbnailPath, hourSlot, today, recordedMs } = args;

  // 같은 슬롯의 기존 row + storage 정리. 폴백 경로에서는 부분 실패 위험을 감수 (메인은 Edge).
  const { data: existing } = await supabase
    .from('logs')
    .select('id, video_url, thumbnail_path')
    .eq('user_id', userId)
    .eq('hour_slot', hourSlot)
    .gte('recorded_at', `${today}T00:00:00.000Z`)
    .lte('recorded_at', `${today}T23:59:59.999Z`)
    .maybeSingle();

  if (existing) {
    await supabase.storage.from('logs').remove([existing.video_url]).catch(() => undefined);
    if (existing.thumbnail_path) {
      await supabase.storage
        .from('thumbnails')
        .remove([existing.thumbnail_path])
        .catch(() => undefined);
    }
    await supabase.from('logs').delete().eq('id', existing.id);
  }

  const { data: insertedLog, error: insertError } = await supabase
    .from('logs')
    .insert({
      user_id: userId,
      video_url: videoPath,
      thumbnail_path: thumbnailPath,
      hour_slot: hourSlot,
      duration_sec: Math.max(1, Math.round(recordedMs / 1000)),
      검수_YN: 'N',
      검수_상태: 'PENDING',
      recorded_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await supabase.rpc('recalculate_daily_log', { p_user_id: userId });

  return insertedLog?.id ?? null;
}

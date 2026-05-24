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

      const hourSlot = new Date().getHours();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 오늘 같은 hour_slot 기존 로그 조회
      const { data: existing } = await supabase
        .from('logs')
        .select('id, video_url')
        .eq('user_id', userId)
        .eq('hour_slot', hourSlot)
        .gte('recorded_at', `${today}T00:00:00.000Z`)
        .lte('recorded_at', `${today}T23:59:59.999Z`)
        .maybeSingle();

      // 기존 로그가 있으면 Storage 파일 + DB 행 삭제
      if (existing) {
        await supabase.storage.from('logs').remove([existing.video_url]);
        await supabase.from('logs').delete().eq('id', existing.id);
      }

      // 새 영상 업로드 — RN fetch+blob 은 file:// URI 에서 size 0 Blob 버그가 있어 File API로 읽는다.
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

      const { data: insertedLog, error: insertError } = await supabase
        .from('logs')
        .insert({
          user_id: userId,
          video_url: uploadData.path,
          thumbnail_path: thumbnailPath,
          hour_slot: hourSlot,
          duration_sec: Math.round(recordedMs / 1000),
          검수_YN: 'N',
          검수_상태: 'PENDING',
          recorded_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      await supabase.rpc('recalculate_daily_log', { p_user_id: userId });

      try {
        await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
      } catch (cleanupError) {
        logger.captureException(cleanupError, {
          tags: { feature: 'daily-log-cleanup' },
          extra: { tempVideoUri },
        });
      }

      return { success: true, logId: insertedLog?.id ?? null };
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

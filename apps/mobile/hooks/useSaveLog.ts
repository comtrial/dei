import { logger } from '@dei/shared';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
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
  }): Promise<{ success: true } | { success: false; message: string }> => {
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
      const fileName = `${userId}/${Date.now()}.${getVideoExtension(tempVideoUri)}`;
      const arrayBuffer = await new File(tempVideoUri).arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        throw new Error('촬영 파일을 읽을 수 없어요. 다시 촬영해 주세요.');
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('logs')
        .upload(fileName, arrayBuffer, { contentType, upsert: false });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('logs').insert({
        user_id: userId,
        video_url: uploadData.path,
        hour_slot: hourSlot,
        duration_sec: Math.round(recordedMs / 1000),
        검수_YN: 'N',
        검수_상태: 'PENDING',
        recorded_at: new Date().toISOString(),
      });

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

      return { success: true };
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

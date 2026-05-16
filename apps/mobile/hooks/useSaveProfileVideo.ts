import { logger } from '@dei/shared';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

const clampProfileVideoDuration = (durationMs: number) =>
  Math.min(2500, Math.max(1500, Math.round(durationMs || 2000)));

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

export function useSaveProfileVideo() {
  const [loading, setLoading] = useState(false);

  const saveProfileVideo = async ({
    tempVideoUri,
    recordedMs,
  }: {
    tempVideoUri?: string;
    recordedMs: number;
  }): Promise<{ success: true } | { success: false; message: string }> => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;

      if (!userId) {
        throw new Error('Not authenticated');
      }

      let fileSizeBytes: number | null = null;
      let storagePath = `${userId}/dev-${Date.now()}.mp4`;

      if (tempVideoUri) {
        const fileInfo = await FileSystem.getInfoAsync(tempVideoUri);
        fileSizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : null;

        if (!fileInfo.exists || !fileSizeBytes) {
          throw new Error('촬영 파일이 비어 있어요. 다시 촬영해 주세요.');
        }

        // RN fetch+blob 은 file:// URI 에서 size 0 Blob 버그가 있어 File API로 읽는다.
        const contentType = getVideoContentType(tempVideoUri);
        const arrayBuffer = await new File(tempVideoUri).arrayBuffer();

        if (arrayBuffer.byteLength === 0) {
          throw new Error('촬영 파일을 읽을 수 없어요. 다시 촬영해 주세요.');
        }

        const fileName = `${userId}/${Date.now()}.${getVideoExtension(tempVideoUri)}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('profile-videos')
          .upload(fileName, arrayBuffer, { contentType, upsert: false });

        if (uploadError) {
          throw uploadError;
        }

        storagePath = uploadData.path;
      }

      const { error: insertError } = await supabase.from('profile_videos').insert({
        user_id: userId,
        storage_path: storagePath,
        duration_ms: clampProfileVideoDuration(recordedMs),
        file_size_bytes: fileSizeBytes,
        mime_type: tempVideoUri ? getVideoContentType(tempVideoUri) : 'video/mp4',
        moderation_status: 'pending',
        is_primary: true,
      });

      if (insertError) {
        throw insertError;
      }

      if (tempVideoUri) {
        try {
          await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
        } catch (cleanupError) {
          logger.captureException(cleanupError, {
            tags: { feature: 'profile-video-cleanup' },
            extra: { tempVideoUri },
          });
        }
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  return { saveProfileVideo, loading };
}

import * as FileSystem from 'expo-file-system';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

const clampProfileVideoDuration = (durationMs: number) =>
  Math.min(2500, Math.max(1500, Math.round(durationMs || 2000)));

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

        const response = await fetch(tempVideoUri);
        const blob = await response.blob();
        const fileName = `${userId}/${Date.now()}.mp4`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('profile-videos')
          .upload(fileName, blob, { contentType: 'video/mp4', upsert: false });

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
        mime_type: 'video/mp4',
        moderation_status: 'pending',
        is_primary: true,
      });

      if (insertError) {
        throw insertError;
      }

      if (tempVideoUri) {
        await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
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

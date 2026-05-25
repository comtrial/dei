/**
 * useHourlyUpload — 방 단위 3초 영상 업로드 (storage + Edge).
 *
 * useSaveLog 패턴의 방 단위 변형. 본인 프로필 영상(`finalize-log`) 과 분리:
 *   - bucket: 'room-uploads' / 'room-thumbnails'
 *   - storage path 패턴: `rooms/<roomId>/<userId>/<ts>.<ext>`
 *   - Edge Function: `room-upload-video` (RPC: upload_hourly_video)
 *
 * KST hour_slot / slot_date 는 클라에서 계산하되 Edge 도 같은 정책으로 재검증.
 */
import { logger } from '@dei/shared';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useState } from 'react';

import { uploadHourlyVideo } from '@/lib/rooms/rooms-service';
import { supabase } from '@/lib/supabase';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getKstHourSlot(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
}

function getKstDateString(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getVideoExtension(uri: string): 'mov' | 'mp4' {
  const ext = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  return ext === 'mov' || ext === 'qt' ? 'mov' : 'mp4';
}

function getVideoContentType(uri: string): string {
  const ext = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  return ext === 'mov' || ext === 'qt' ? 'video/quicktime' : 'video/mp4';
}

export type UploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; reason: 'auth' | 'empty-file' | 'storage' | 'edge' | 'slot-taken' | 'unknown'; message: string };

export function useHourlyUpload(roomId: string | null | undefined) {
  const [loading, setLoading] = useState(false);

  const upload = async ({
    tempVideoUri,
    recordedMs,
  }: {
    tempVideoUri: string;
    recordedMs: number;
  }): Promise<UploadResult> => {
    if (!roomId) {
      return { ok: false, reason: 'unknown', message: 'roomId missing' };
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        return { ok: false, reason: 'auth', message: '로그인이 필요해요.' };
      }

      const info = await FileSystem.getInfoAsync(tempVideoUri);
      if (!info.exists || !('size' in info) || !info.size) {
        return { ok: false, reason: 'empty-file', message: '촬영 파일이 비어 있어요.' };
      }

      const now = new Date();
      const hourSlot = getKstHourSlot(now);
      const slotDate = getKstDateString(now);
      const ts = Date.now();
      const ext = getVideoExtension(tempVideoUri);

      const videoBuf = await new File(tempVideoUri).arrayBuffer();
      if (videoBuf.byteLength === 0) {
        return { ok: false, reason: 'empty-file', message: '촬영 파일을 읽을 수 없어요.' };
      }

      const videoName = `rooms/${roomId}/${userId}/${ts}.${ext}`;
      const contentType = getVideoContentType(tempVideoUri);

      // 영상 + 썸네일 병렬
      const videoUpload = supabase.storage
        .from('room-uploads')
        .upload(videoName, videoBuf, { contentType, upsert: false });

      const thumbnailUpload = (async (): Promise<string | null> => {
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(tempVideoUri, {
            time: 0,
            quality: 0.7,
          });
          const thumbBuf = await new File(thumbUri).arrayBuffer();
          if (thumbBuf.byteLength === 0) {
            await FileSystem.deleteAsync(thumbUri, { idempotent: true }).catch(() => undefined);
            return null;
          }
          const thumbName = `rooms/${roomId}/${userId}/${ts}.jpg`;
          const { error } = await supabase.storage
            .from('room-thumbnails')
            .upload(thumbName, thumbBuf, { contentType: 'image/jpeg', upsert: false });
          await FileSystem.deleteAsync(thumbUri, { idempotent: true }).catch(() => undefined);
          if (error) return null;
          return thumbName;
        } catch {
          return null;
        }
      })();

      const [vRes, thumbnailPath] = await Promise.all([videoUpload, thumbnailUpload]);
      if (vRes.error) {
        logger.captureException(vRes.error, {
          tags: { feature: 'rooms', action: 'storage-upload' },
          extra: { roomId, hourSlot, slotDate },
        });
        return { ok: false, reason: 'storage', message: '영상 업로드에 실패했어요.' };
      }

      try {
        const { uploadId } = await uploadHourlyVideo({
          roomId,
          storagePath: vRes.data.path,
          thumbnailPath,
          durationMs: Math.max(500, Math.min(3500, Math.round(recordedMs))),
          hourSlot,
          slotDate,
        });
        // 로컬 임시 파일 정리
        try {
          await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
        } catch {
          /* ignore */
        }
        return { ok: true, uploadId };
      } catch (e) {
        const message = e instanceof Error ? e.message : '알 수 없는 오류';
        if (message.includes('slot') || message.includes('409')) {
          return { ok: false, reason: 'slot-taken', message: '이 시간 슬롯엔 이미 영상이 있어요.' };
        }
        return { ok: false, reason: 'edge', message };
      }
    } catch (e) {
      logger.captureException(e, {
        tags: { feature: 'rooms', action: 'upload-hourly-video' },
        extra: { roomId, recordedMs },
      });
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      return { ok: false, reason: 'unknown', message };
    } finally {
      setLoading(false);
    }
  };

  return { upload, loading };
}

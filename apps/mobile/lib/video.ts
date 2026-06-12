import CameraView from 'expo-camera/build/CameraView';
import * as FileSystem from 'expo-file-system/legacy';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { type RefObject } from 'react';

import type { Database } from '@dei/api';
import { POLICY, getCurrentHourSlotKst, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type VideoRow = Database['public']['Tables']['video']['Insert'];

const BUCKET = 'room-videos' as const;

export type UploadClipOptions = {
  onProgress?: (progress: number) => void;
};

export type UploadClipResult = {
  videoId: string;
  thumbnailUrl: string;
};

export type RecordClipResult = {
  localUri: string;
  durationMs: number;
};

export async function recordClip(
  cameraRef: RefObject<CameraView | null>,
  options?: { maxDurationMs?: number },
): Promise<RecordClipResult> {
  if (!cameraRef.current) {
    throw new Error('CAMERA_NOT_READY');
  }

  const maxDurationMs = options?.maxDurationMs ?? POLICY.video.maxDurationMs;
  const result = await cameraRef.current.recordAsync({
    maxDuration: maxDurationMs / 1000,
  });

  if (!result?.uri) {
    throw new Error('RECORD_FAILED');
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists) {
    throw new Error('RECORD_FILE_MISSING');
  }

  if (info.size > POLICY.video.maxFileSizeBytes) {
    throw new Error('VIDEO_TOO_LARGE');
  }

  return { localUri: result.uri, durationMs: maxDurationMs };
}

async function generateThumbnail(localUri: string): Promise<string> {
  let lastThumbUri: string | null = null;
  for (const quality of [0.7, 0.4, 0.2, 0.1]) {
    const thumb = await getThumbnailAsync(localUri, { time: 0, quality });
    lastThumbUri = thumb.uri;
    const info = await FileSystem.getInfoAsync(thumb.uri);
    if (info.exists && info.size <= POLICY.video.thumbnailMaxSizeBytes) {
      return thumb.uri;
    }
  }
  if (lastThumbUri) return lastThumbUri;
  throw new Error('THUMBNAIL_TOO_LARGE');
}

async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function uploadClip(
  args: { roomId: string; localUri: string; durationMs?: number; capturedAtIso?: string; muted?: boolean; caption?: string | null },
  options: UploadClipOptions = {},
): Promise<UploadClipResult> {
  const { roomId, localUri, durationMs = POLICY.video.maxDurationMs, capturedAtIso, muted = false, caption } = args;
  const { onProgress } = options;

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('AUTH_REQUIRED');
  }
  const userId = user.id;

  const videoId = generateId();
  const videoPath = `${roomId}/${userId}/${videoId}.mp4`;
  const thumbPath = `${roomId}/${userId}/${videoId}.jpg`;

  let thumbnailUri: string;
  try {
    thumbnailUri = await generateThumbnail(localUri);
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'thumbnail' },
      extra: { roomId },
    });
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId, capturedAtIso, muted });
    throw err;
  }

  onProgress?.(0.1);

  let videoBuffer: ArrayBuffer;
  let thumbBuffer: ArrayBuffer;
  try {
    [videoBuffer, thumbBuffer] = await Promise.all([
      readFileAsArrayBuffer(localUri),
      readFileAsArrayBuffer(thumbnailUri),
    ]);
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'read-file' },
      extra: { roomId },
    });
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId, capturedAtIso, muted });
    throw err;
  }

  onProgress?.(0.3);

  try {
    const [videoUpload, thumbUpload] = await Promise.all([
      supabase.storage.from(BUCKET).upload(videoPath, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false,
      }),
      supabase.storage.from(BUCKET).upload(thumbPath, thumbBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      }),
    ]);

    if (videoUpload.error) throw videoUpload.error;
    if (thumbUpload.error) throw thumbUpload.error;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'video' },
      extra: { roomId },
    });
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId, capturedAtIso, muted });
    throw err;
  }

  onProgress?.(0.8);

  const trimmedCaption = caption?.trim() || null;

  const row: VideoRow = {
    id: videoId,
    room_id: roomId,
    user_id: userId,
    storage_path: videoPath,
    thumbnail_path: thumbPath,
    duration_ms: durationMs,
    hour_slot: getCurrentHourSlotKst(),
    status: 'ready',
    muted,
    ...(trimmedCaption ? { caption: trimmedCaption } : {}),
    ...(capturedAtIso ? { created_at: capturedAtIso } : {}),
  };

  try {
    const { error: insertErr } = await supabase.from('video').insert(row);
    if (insertErr) throw insertErr;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'insert' },
      extra: { roomId, videoId },
    });
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId, capturedAtIso, muted });
    throw err;
  }

  onProgress?.(1.0);

  void supabase.functions.invoke('notify-video-uploaded', {
    body: { room_id: roomId, video_id: videoId },
  }).then(({ error: notifyErr }) => {
    if (!notifyErr) return;
    logger.captureException(notifyErr, {
      tags: { feature: 'video-upload', step: 'notify-video-uploaded' },
      extra: { roomId, videoId },
    });
  }).catch((notifyErr) => {
    logger.captureException(notifyErr, {
      tags: { feature: 'video-upload', step: 'notify-video-uploaded' },
      extra: { roomId, videoId },
    });
  });

  const { data: signedData, error: signedErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(thumbPath, 3600);

  if (signedErr || !signedData?.signedUrl) {
    logger.captureException(signedErr ?? new Error('SIGNED_URL_FAILED'), {
      tags: { feature: 'video-upload', step: 'signed-url' },
      extra: { roomId, videoId },
    });
    return { videoId, thumbnailUrl: '' };
  }

  return { videoId, thumbnailUrl: signedData.signedUrl };
}

const VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory}room-videos/`;

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
  }
}

async function downloadToCache(
  storagePath: string,
  cachePath: string,
  tagFeature: string,
  extra: Record<string, unknown>,
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(cachePath);
    if (info.exists && info.size > 0) return cachePath;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 600);
    if (error || !data?.signedUrl) {
      logger.captureException(error ?? new Error('signed URL empty'), {
        tags: { feature: tagFeature, step: 'signed-url' },
        extra,
      });
      return null;
    }

    const download = await FileSystem.downloadAsync(data.signedUrl, cachePath);
    if (download.status !== 200) {
      try {
        await FileSystem.deleteAsync(cachePath, { idempotent: true });
      } catch {}
      logger.captureException(new Error(`Download failed: HTTP ${download.status}`), {
        tags: { feature: tagFeature, step: 'download' },
        extra: { ...extra, status: download.status },
      });
      return null;
    }

    return download.uri;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: tagFeature, step: 'unexpected' },
      extra,
    });
    return null;
  }
}

export async function getCachedVideoUri(
  storagePath: string,
  videoId: string,
): Promise<string | null> {
  await ensureCacheDir();
  return downloadToCache(storagePath, `${VIDEO_CACHE_DIR}${videoId}.mp4`, 'video-cache', { videoId });
}

export async function getCachedThumbnailUri(
  storagePath: string,
  videoId: string,
): Promise<string | null> {
  await ensureCacheDir();
  return downloadToCache(storagePath, `${VIDEO_CACHE_DIR}${videoId}.jpg`, 'thumbnail-cache', { videoId });
}

export async function isClipVisible(args: {
  videoId: string;
  viewerId: string;
  roomId: string;
}): Promise<boolean> {
  const { viewerId, roomId } = args;

  const windowMs =
    POLICY.blurGate.visibilityWindowHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data, error } = await supabase
    .from('video')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', viewerId)
    .eq('status', 'ready')
    .gte('created_at', since)
    .limit(1);

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'video-upload', step: 'visibility-check' },
      extra: { roomId, viewerId },
    });
    return false;
  }

  return (data?.length ?? 0) >= 1;
}

type QueueEntry = {
  videoId: string;
  roomId: string;
  localUri: string;
  durationMs: number;
  enqueuedAt: string;
  capturedAtIso?: string;
  muted?: boolean;
};

const QUEUE_FILE_NAME = 'video_upload_queue.json';

function queueFilePath(): string {
  return `${FileSystem.documentDirectory}${QUEUE_FILE_NAME}`;
}

async function readQueue(): Promise<QueueEntry[]> {
  try {
    const info = await FileSystem.getInfoAsync(queueFilePath());
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(queueFilePath());
    return JSON.parse(raw) as QueueEntry[];
  } catch (err) {
    // 큐 파일 JSON 손상 → 대기 중인 업로드 전부를 조용히 잃는다(사용자 영향). 캡처.
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'queue-read' },
    });
    return [];
  }
}

// 큐 항목이 이 시간을 넘겨도 계속 재시도 실패하면 '영구 실패' 신호로 본다.
const QUEUE_STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000;

async function writeQueue(entries: QueueEntry[]): Promise<void> {
  await FileSystem.writeAsStringAsync(
    queueFilePath(),
    JSON.stringify(entries),
  );
}

async function persistToLocalQueue(entry: Omit<QueueEntry, 'enqueuedAt'>): Promise<void> {
  try {
    const queue = await readQueue();
    const alreadyQueued = queue.some((e) => e.videoId === entry.videoId);
    if (alreadyQueued) return;
    queue.push({ ...entry, enqueuedAt: new Date().toISOString() });
    await writeQueue(queue);
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'queue-persist' },
    });
  }
}

export async function retryQueuedUploads(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: QueueEntry[] = [];

  for (const entry of queue) {
    try {
      const info = await FileSystem.getInfoAsync(entry.localUri);
      if (!info.exists) {
        continue;
      }

      await uploadClip({
        roomId: entry.roomId,
        localUri: entry.localUri,
        durationMs: entry.durationMs,
        capturedAtIso: entry.capturedAtIso,
        muted: entry.muted,
      });
    } catch (err) {
      remaining.push(entry);
      // 단발 일시 실패는 재큐로 회복되므로 캡처 안 함. 다만 임계 시간을 넘겨도
      // 계속 실패하면 영구 실패(사용자 영상 영구 유실)로 보고 1회 경고한다.
      const enqueuedAtMs = Date.parse(entry.enqueuedAt);
      if (Number.isFinite(enqueuedAtMs) && Date.now() - enqueuedAtMs > QUEUE_STUCK_THRESHOLD_MS) {
        logger.captureMessage('video upload retry stuck', 'warning', {
          tags: { feature: 'video-upload', step: 'retry-queue' },
          extra: {
            videoId: entry.videoId,
            enqueuedAt: entry.enqueuedAt,
            detail: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  await writeQueue(remaining);
}

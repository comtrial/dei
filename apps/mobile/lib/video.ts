import type { CameraViewRef } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { type RefObject } from 'react';

import type { Database } from '@dei/api';
import { POLICY, getCurrentHourSlotKst, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

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
  cameraRef: RefObject<CameraViewRef | null>,
): Promise<RecordClipResult> {
  if (!cameraRef.current) {
    throw new Error('CAMERA_NOT_READY');
  }

  const result = await cameraRef.current.record({
    maxDuration: POLICY.video.maxDurationMs / 1000,
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

  const durationMs = Math.min(
    POLICY.video.maxDurationMs,
    POLICY.video.maxDurationMs,
  );

  return { localUri: result.uri, durationMs };
}

async function generateThumbnail(localUri: string): Promise<string> {
  let thumb = await getThumbnailAsync(localUri, { time: 0, quality: 0.7 });

  const info = await FileSystem.getInfoAsync(thumb.uri);
  if (info.exists && info.size > POLICY.video.thumbnailMaxSizeBytes) {
    thumb = await getThumbnailAsync(localUri, { time: 0, quality: 0.4 });
    const retryInfo = await FileSystem.getInfoAsync(thumb.uri);
    if (retryInfo.exists && retryInfo.size > POLICY.video.thumbnailMaxSizeBytes) {
      throw new Error('THUMBNAIL_TOO_LARGE');
    }
  }

  return thumb.uri;
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
  args: { roomId: string; localUri: string; durationMs?: number },
  options: UploadClipOptions = {},
): Promise<UploadClipResult> {
  const { roomId, localUri, durationMs = POLICY.video.maxDurationMs } = args;
  const { onProgress } = options;

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('AUTH_REQUIRED');
  }
  const userId = user.id;

  const videoId = crypto.randomUUID();
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
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId });
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
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId });
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
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId });
    throw err;
  }

  onProgress?.(0.8);

  const row: VideoRow = {
    id: videoId,
    room_id: roomId,
    user_id: userId,
    storage_path: videoPath,
    thumbnail_path: thumbPath,
    duration_ms: durationMs,
    hour_slot: getCurrentHourSlotKst(),
    status: 'ready',
  };

  try {
    const { error: insertErr } = await supabase.from('video').insert(row);
    if (insertErr) throw insertErr;
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'video-upload', step: 'insert' },
      extra: { roomId, videoId },
    });
    await persistToLocalQueue({ roomId, localUri, durationMs, videoId });
    throw err;
  }

  onProgress?.(1.0);

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
  } catch {
    return [];
  }
}

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
      });
    } catch {
      remaining.push(entry);
    }
  }

  await writeQueue(remaining);
}

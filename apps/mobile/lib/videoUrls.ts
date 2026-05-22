/**
 * 영상/썸네일 storage path ↔ public URL 변환 헬퍼.
 *
 * - `logs.video_url` 컬럼에는 storage path 가 저장된다 (full URL X).
 * - `logs.thumbnail_path`, `profile_videos.thumbnail_path` 도 동일.
 * - public URL 이 이미 들어오면(http(s)://) 그대로 통과.
 */
import { supabase } from '@/lib/supabase';

const LOGS_BUCKET = 'logs';
const THUMBNAILS_BUCKET = 'thumbnails';

function isAbsoluteUrl(path: string): boolean {
  return /^https?:\/\//.test(path);
}

export function resolveLogVideoUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return '';
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;
  return supabase.storage.from(LOGS_BUCKET).getPublicUrl(pathOrUrl).data.publicUrl;
}

export function resolveThumbnailUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;
  return supabase.storage.from(THUMBNAILS_BUCKET).getPublicUrl(pathOrUrl).data.publicUrl;
}

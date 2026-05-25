// ROOMS-CRON · POST /functions/v1/purge-expired-uploads
//
// D8 — `hourly_uploads.expires_at < now()` 인 영상 row + storage 객체 hard delete.
// 방 종료 후 30일이 지나면 자동 삭제.
//
// Cron: 매일 새벽 4시 KST (`0 19 * * *` UTC, KST 04:00).
import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { clampLimit, parseDateOrNow } from '../_shared/time.ts';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

type Body = { dryRun?: boolean; now?: string; limit?: number };
type Row = { id: string; storage_path: string; thumbnail_path: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  if (!isServiceRoleRequest(req)) return errorResponse('unauthorized', 401);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const now = parseDateOrNow(body.now);
    const limit = clampLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const dryRun = body.dryRun === true;
    const admin = createAdminClient();

    const candidatesRes = await admin
      .from('hourly_uploads')
      .select('id, storage_path, thumbnail_path')
      .lt('expires_at', now.toISOString())
      .limit(limit);

    if (candidatesRes.error) throw candidatesRes.error;
    const rows = (candidatesRes.data ?? []) as Row[];
    if (rows.length === 0) {
      return jsonResponse({ processed: 0, deleted: 0, dryRun });
    }

    if (dryRun) {
      return jsonResponse({
        processed: rows.length,
        deleted: 0,
        sampleIds: rows.slice(0, 10).map((r) => r.id),
        dryRun: true,
      });
    }

    const storagePaths = rows.map((r) => r.storage_path).filter(Boolean);
    const thumbnailPaths = rows
      .map((r) => r.thumbnail_path)
      .filter((p): p is string => Boolean(p));

    let storageOk = true;
    let thumbnailsOk = true;

    if (storagePaths.length > 0) {
      const remove = await admin.storage.from('room-uploads').remove(storagePaths);
      if (remove.error) storageOk = false;
    }
    if (thumbnailPaths.length > 0) {
      const remove = await admin.storage.from('room-thumbnails').remove(thumbnailPaths);
      if (remove.error) thumbnailsOk = false;
    }

    const rowDelete = await admin
      .from('hourly_uploads')
      .delete()
      .in('id', rows.map((r) => r.id));

    if (rowDelete.error) throw rowDelete.error;

    return jsonResponse({
      processed: rows.length,
      deleted: rows.length,
      storageOk,
      thumbnailsOk,
      dryRun: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return errorResponse(message, 500);
  }
});

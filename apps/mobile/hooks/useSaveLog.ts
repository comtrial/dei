import * as FileSystem from 'expo-file-system';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

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

      // 새 영상 업로드
      const fileName = `${userId}/${Date.now()}.mp4`;
      const response = await fetch(tempVideoUri);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('logs')
        .upload(fileName, blob, { contentType: 'video/mp4', upsert: false });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('logs').insert({
        user_id: userId,
        video_url: uploadData.path,
        hour_slot: hourSlot,
        duration_sec: Math.round(recordedMs / 1000),
        검수_yn: 'N',
        검수_상태: 'PENDING',
        recorded_at: new Date().toISOString(),
      });

      if (insertError) throw insertError;

      await supabase.rpc('recalculate_daily_log', { p_user_id: userId });
      await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });

      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  return { saveLog, loading };
}

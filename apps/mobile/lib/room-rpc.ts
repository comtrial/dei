import type { Database } from '@dei/api';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

type VideoRow = Database['public']['Tables']['video']['Row'];

export async function getRoomVideos(
  roomId: string,
  hourFrom: number,
  hourTo: number,
): Promise<VideoRow[]> {
  try {
    const { data, error } = await supabase
      .from('video')
      .select('*')
      .eq('room_id', roomId)
      .gte('hour_slot', hourFrom)
      .lte('hour_slot', hourTo)
      .eq('status', 'ready')
      .order('hour_slot', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logger.captureException(err, {
      tags: { feature: 'room_rpc', rpc: 'get_room_videos', room_id: roomId },
      extra: { hourFrom, hourTo },
    });
    return [];
  }
}

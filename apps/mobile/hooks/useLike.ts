import { useState } from 'react';

import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

export function useLike(userId: string | undefined) {
  const [likeUsed, setLikeUsed] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkLikeUsed = async () => {
    if (!userId) return;
    setChecking(true);
    const today = getToday();
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('from_user_id', userId)
      .gte('liked_at', `${today}T00:00:00.000Z`)
      .limit(1);
    setLikeUsed((data?.length ?? 0) > 0);
    setChecking(false);
  };

  const sendLike = async (toUserId: string): Promise<boolean> => {
    if (!userId || likeUsed) return false;
    const { error } = await supabase.from('likes').insert({
      from_user_id: userId,
      to_user_id: toUserId,
      liked_at: new Date().toISOString(),
    });
    if (!error) {
      setLikeUsed(true);
      return true;
    }
    return false;
  };

  return { likeUsed, checking, checkLikeUsed, sendLike };
}

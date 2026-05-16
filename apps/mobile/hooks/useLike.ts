import { useState } from 'react';

import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';
import { useSendLike } from '@/hooks/useSendLike';

const FREE_DAILY_QUOTA = 1;

export function useLike(userId: string | undefined) {
  const [remainingLikes, setRemainingLikes] = useState(0);
  const [checking, setChecking] = useState(false);
  const { send } = useSendLike();

  const checkRemainingLikes = async () => {
    if (!userId) return;
    setChecking(true);
    const today = getToday();
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('from_user_id', userId)
      .gte('liked_at', `${today}T00:00:00.000Z`);
    const usedToday = data?.length ?? 0;
    setRemainingLikes(Math.max(0, FREE_DAILY_QUOTA - usedToday));
    setChecking(false);
  };

  // send_like RPC 경로로 일원화 (마이그레이션 적용 후 검증/중복 방지 활성화)
  const sendLike = async (toUserId: string): Promise<boolean> => {
    if (!userId || remainingLikes <= 0) return false;
    const result = await send({ toUserId, attachedLogId: null });
    if (result.kind === 'ok') {
      setRemainingLikes((prev) => Math.max(0, prev - 1));
      return true;
    }
    return false;
  };

  return { remainingLikes, checking, checkRemainingLikes, sendLike };
}

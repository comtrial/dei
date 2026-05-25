/**
 * useBlurGate — 본인의 마지막 업로드 시각을 기반으로 블러 게이트 상태 계산.
 *
 * RLS 가 실제 가시성을 막지만, UI 가 안내 문구·CTA 를 다르게 보여주려면
 * 클라도 동일한 규칙을 평가해야 한다 (`lib/rooms/blur-gate.ts`).
 */
import { useEffect, useState } from 'react';

import { logger } from '@dei/shared';

import {
  type BlurGateState,
  blurGateRemainingMs,
  evaluateBlurGate,
} from '@/lib/rooms/blur-gate';
import { supabase } from '@/lib/supabase';

export function useBlurGate(roomId: string | null | undefined, userId: string | null | undefined) {
  const [state, setState] = useState<BlurGateState>({ kind: 'never-uploaded' });
  const [remainingMs, setRemainingMs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId || !userId) {
      setState({ kind: 'never-uploaded' });
      setRemainingMs(0);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('hourly_uploads')
        .select('uploaded_at')
        .eq('room_id', roomId)
        .eq('profile_id', userId)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        logger.captureException(error, {
          tags: { feature: 'rooms', action: 'fetch-last-upload' },
          extra: { roomId, userId },
        });
        setState({ kind: 'never-uploaded' });
        setRemainingMs(0);
      } else {
        const probe = { lastUploadedAt: data?.uploaded_at ?? null };
        setState(evaluateBlurGate(probe));
        setRemainingMs(blurGateRemainingMs(probe));
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [roomId, userId]);

  return { state, remainingMs, loading, isOpen: state.kind === 'open' };
}

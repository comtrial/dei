/**
 * CH1 채팅 목록 훅 — conversations updated_at desc 로드.
 * 0건 → CH3 빈 상태 (호출부 분기).
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchChatList } from '@/lib/chat/chat-service';
import type { ChatListItem } from '@/lib/chat/types';
import { logger } from '@dei/shared';

export interface UseChatListResult {
  items: ChatListItem[];
  loading: boolean;
  /** 로드 자체가 실패 (네트워크 등). */
  error: boolean;
  reload: () => void;
}

export function useChatList(myUserId: string | null): UseChatListResult {
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!myUserId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);

    fetchChatList(myUserId)
      .then((list) => {
        if (active) setItems(list);
      })
      .catch((err) => {
        logger.captureException(err, {
          tags: { feature: 'chat-list', action: 'load' },
        });
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [myUserId, nonce]);

  return { items, loading, error, reload };
}

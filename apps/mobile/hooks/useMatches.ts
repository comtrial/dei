/**
 * LK8 매칭 목록 훅.
 *
 * 매칭 로직 본체(좋아요 상호 수락 → match row 생성)는 매칭 워크플로 소관이라
 * 이 repo 범위 밖이다. 채팅 funnel 관점에서 LK8 이 필요로 하는 것은 "매칭되어
 * 대화 가능한 상대 + 그 conversationId" 뿐이므로, 채팅 데이터 계층의
 * `fetchChatList`(매칭+미차단만 RLS 노출)를 매칭 진입 소스로 재사용한다.
 * 이렇게 하면 LK8 "채팅하기" → CH0 라우터 연결이 실제 코드 경로로 성립한다.
 */
import { useEffect, useState } from 'react';

import { fetchChatList } from '@/lib/chat/chat-service';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export interface MatchItem {
  matchId: string;
  conversationId: string | null;
  nickname: string;
}

export interface UseMatchesResult {
  matches: MatchItem[];
  loading: boolean;
}

export function useMatches(): UseMatchesResult {
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myUserId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    fetchChatList(myUserId)
      .then((list) => {
        if (!active) return;
        setMatches(
          list.map((c) => ({
            matchId: c.conversationId,
            conversationId: c.conversationId,
            nickname: c.otherNickname,
          })),
        );
      })
      .catch((err) => {
        logger.captureException(err, {
          tags: { feature: 'matches', action: 'load' },
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [myUserId]);

  return { matches, loading };
}

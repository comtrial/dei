import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { analytics, logger } from '@dei/shared';

type Profile = {
  nickname: string | null;
  birth_date: string | null;
  region_sido: string | null;
};

export default function MatchedScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [counterpart, setCounterpart] = useState<Profile | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // LK8/matched 화면 표시를 매칭당 1회만 집계하기 위한 가드.
  const matchCompletedCapturedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!matchId || !user?.id) return;
    void logger.withErrorCapture('match-detail.fetch', async () => {
      const sb = supabase as any;
      const { data: match } = await sb.from('matches')
        .select('user_a_id, user_b_id')
        .eq('id', matchId)
        .single();
      if (!match) return;
      const cpId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;

      // 매칭 완료 화면 표시 — counterpart 확정 시점에 1회 capture.
      if (matchCompletedCapturedRef.current !== matchId) {
        matchCompletedCapturedRef.current = matchId;
        analytics.capture('match_completed', {
          peer_user_id: cpId,
          source: 'accept',
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname, birth_date, region_sido')
        .eq('user_id', cpId)
        .single();
      if (profile) setCounterpart(profile);

      // 채팅 진입용 conversation 조회 (accept_like 가 매칭 시 생성). match_id 로 1:1.
      const { data: conv } = await sb.from('conversations')
        .select('id')
        .eq('match_id', matchId)
        .maybeSingle();
      if (conv?.id) setConversationId(conv.id);
    }, { tags: { feature: 'match-detail', matchId } });
  }, [matchId, user?.id]);

  const age = counterpart?.birth_date
    ? Math.floor(
        (Date.now() - new Date(counterpart.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <Text className="text-6xl">🎉</Text>
        <Text className="text-foreground text-xl font-semibold text-center">
          서로 좋아요를 보냈어요
        </Text>
        {counterpart && (
          <View className="items-center gap-2 mt-4">
            <View className="w-24 h-24 rounded-full bg-muted items-center justify-center">
              <Text className="text-muted-foreground text-3xl">
                {(counterpart.nickname ?? '?').charAt(0)}
              </Text>
            </View>
            <Text className="text-foreground text-lg font-semibold">
              {counterpart.nickname ?? '—'}
              {age !== null ? ` · ${age}` : ''}
            </Text>
            {counterpart.region_sido && (
              <Text className="text-muted-foreground text-sm">{counterpart.region_sido}</Text>
            )}
          </View>
        )}
      </View>

      <View className="px-6 pb-8 gap-2">
        <Pressable
          onPress={() => {
            // CH0 게이트(/chat)로 conversationId 전달 — 게이트가 상태/차단 판정 후
            // 채팅방(CH2) 진입. conversation 미로드/부재 시 DM 목록으로 안전 폴백.
            if (conversationId) {
              router.replace({
                pathname: ROUTES.chatRoute,
                params: { conversationId, source: 'match' },
              });
            } else {
              router.replace(ROUTES.messages);
            }
          }}
          className="bg-primary rounded-xl py-4 items-center active:opacity-80"
          testID="match-chat-cta"
        >
          <Text className="text-primary-foreground font-semibold text-base">채팅하기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace(ROUTES.likes as never)}
          className="rounded-xl py-4 items-center active:opacity-60"
          testID="match-close"
        >
          <Text className="text-muted-foreground">닫기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

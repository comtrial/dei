import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

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

  useEffect(() => {
    if (!matchId || !user?.id) return;
    logger.withErrorCapture('match-detail.fetch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: match } = await (supabase as any).from('matches')
        .select('user_a_id, user_b_id')
        .eq('id', matchId)
        .single();
      if (!match) return;
      const cpId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname, birth_date, region_sido')
        .eq('user_id', cpId)
        .single();
      if (profile) setCounterpart(profile);
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
          onPress={() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (router.replace as any)({ pathname: '/messages/[matchId]', params: { matchId } })
          }
          className="bg-primary rounded-xl py-4 items-center active:opacity-80"
          testID="match-chat-cta"
        >
          <Text className="text-primary-foreground font-semibold text-base">채팅하기</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (router.replace as any)('/(app)/likes')
          }
          className="rounded-xl py-4 items-center active:opacity-60"
          testID="match-close"
        >
          <Text className="text-muted-foreground">닫기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

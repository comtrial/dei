import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { logger } from '@dei/shared';

type LikeDetail = {
  to_user_id: string;
  liked_at: string;
};

export default function SentLikeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [like, setLike] = useState<LikeDetail | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    logger.withErrorCapture('sent-like-detail.fetch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('likes') as any)
        .select('to_user_id, liked_at')
        .eq('id', id)
        .single();
      if (!data) return;
      setLike(data as LikeDetail);
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('user_id', data.to_user_id)
        .single();
      if (profile) setNickname(profile.nickname);
    }, { tags: { feature: 'sent-like-detail', likeId: id } });
  }, [id]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* 상대 프로필 영역 — 06 ProfileViewer 연결 전 임시 */}
      <View className="flex-1 items-center justify-center gap-4">
        <View className="w-24 h-24 rounded-full bg-muted items-center justify-center">
          <Text className="text-muted-foreground text-3xl">
            {(nickname ?? '?').charAt(0)}
          </Text>
        </View>
        <Text className="text-foreground text-xl font-semibold">{nickname ?? '—'}</Text>
      </View>

      {/* 응답 대기 CTA (LK10) */}
      <SafeAreaView edges={['bottom']} className="bg-background border-t border-border">
        <View className="px-4 py-3">
          <View className="rounded-xl py-3 items-center bg-muted">
            <View className="flex-row items-center gap-2">
              <Text className="text-muted-foreground text-sm">⏳</Text>
              <Text className="text-muted-foreground text-sm">응답 대기 중</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

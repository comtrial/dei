import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReceivedLikeFooter } from '@/components/likes/ReceivedLikeFooter';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';
import type { ResolveResult } from '@/hooks/useLikeResolution';

type LikeDetail = {
  from_user_id: string;
  attached_log_id: string | null;
  liked_at: string;
  expires_at: string;
};

export default function ReceivedLikeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [like, setLike] = useState<LikeDetail | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    logger.withErrorCapture('received-like-detail.fetch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('likes') as any)
        .select('from_user_id, attached_log_id, liked_at, expires_at')
        .eq('id', id)
        .single();
      if (!data) return;
      setLike(data as LikeDetail);

      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('user_id', data.from_user_id)
        .single();
      if (profile) setNickname(profile.nickname);
    }, { tags: { feature: 'received-like-detail', likeId: id } });
  }, [id]);

  function handleResolved(result: ResolveResult) {
    if (result.kind === 'accepted') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router.replace as any)({
        pathname: '/(app)/matched/[matchId]',
        params: { matchId: result.matchId },
      });
    } else if (result.kind === 'rejected') {
      router.back();
    } else {
      // 에러
      const msg =
        result.reason === 'expired'
          ? '만료된 좋아요예요'
          : result.reason === 'not_pending'
          ? '이미 처리된 좋아요예요'
          : '처리에 실패했어요. 잠시 후 다시 시도해주세요';
      Alert.alert('알림', msg, [{ text: '확인', onPress: () => router.back() }]);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* 상대 프로필 영역 — 06 ProfileViewer 연결 전 임시 */}
      <View className="flex-1 items-center justify-center gap-4">
        <View className="w-24 h-24 rounded-full bg-muted items-center justify-center">
          <Text className="text-muted-foreground text-3xl">
            {(nickname ?? '?').charAt(0)}
          </Text>
        </View>
        <Text className="text-foreground text-xl font-semibold">{nickname ?? '—'}</Text>
        <Text className="text-muted-foreground text-sm">
          {like ? `받은 좋아요 ID: ${id.slice(0, 8)}…` : '불러오는 중…'}
        </Text>
      </View>

      {/* 수락/거절 CTA (LK6, LK7) */}
      {id && <ReceivedLikeFooter likeId={id} onResolved={handleResolved} />}
    </SafeAreaView>
  );
}

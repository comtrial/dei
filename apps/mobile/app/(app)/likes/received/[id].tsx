import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReceivedLikeFooter } from '@/components/likes/ReceivedLikeFooter';
import { ProfileScreen } from '@/components/profile/ProfileScreen';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
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
  const [like, setLike] = useState<LikeDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    void logger.withErrorCapture('received-like-detail.fetch', async () => {
      const { data } = await (supabase.from('likes') as never as {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            single: () => Promise<{ data: LikeDetail | null }>;
          };
        };
      })
        .select('from_user_id, attached_log_id, liked_at, expires_at')
        .eq('id', id)
        .single();
      if (data) setLike(data);
    }, { tags: { feature: 'received-like-detail', likeId: id } });
  }, [id]);

  function handleResolved(result: ResolveResult) {
    if (result.kind === 'accepted') {
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
    <View className="flex-1 bg-background">
      {/* 상대 공개 프로필 (영상/사진/소개). 로드 전엔 안내. */}
      {like ? (
        <ProfileScreen mode="public" profileUserId={like.from_user_id} />
      ) : (
        <SafeAreaView className="flex-1 items-center justify-center" edges={['top']}>
          <Text className="text-muted-foreground text-sm">불러오는 중…</Text>
        </SafeAreaView>
      )}

      {/* 수락/거절 CTA (LK6, LK7) — 프로필 위에 하단 floating 으로 유지 */}
      {id && (
        <View className="absolute bottom-0 left-0 right-0">
          <ReceivedLikeFooter likeId={id} likedAt={like?.liked_at} onResolved={handleResolved} />
        </View>
      )}
    </View>
  );
}

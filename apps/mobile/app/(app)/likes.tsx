import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReceivedLikesList } from '@/components/likes/ReceivedLikesList';
import { SentLikesList } from '@/components/likes/SentLikesList';
import { Text } from '@/components/ui/text';
import { useLikesUnreadCount } from '@/hooks/useLikesUnreadCount';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

type Tab = 'received' | 'sent';

export default function LikesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'received');
  const unread = useLikesUnreadCount(user?.id);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* 헤더 */}
      <View className="px-4 pt-3 pb-2">
        <Text className="text-foreground text-2xl font-semibold">좋아요</Text>
      </View>

      {/* 세그먼트 탭 (LK1) */}
      <View className="flex-row mx-4 mb-2 bg-muted rounded-xl p-1">
        <Pressable
          onPress={() => setTab('received')}
          className={cn(
            'flex-1 flex-row items-center justify-center py-2 rounded-lg gap-1',
            tab === 'received' && 'bg-background'
          )}
          testID="likes-tab-received"
        >
          <Text
            className={cn(
              'text-sm font-medium',
              tab === 'received' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            받은
          </Text>
          {unread > 0 && (
            <View className="bg-primary rounded-full px-1.5 min-w-[18px] h-[18px] items-center justify-center">
              <Text className="text-primary-foreground text-[10px] font-bold">
                {unread > 99 ? '99+' : String(unread)}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => setTab('sent')}
          className={cn(
            'flex-1 items-center justify-center py-2 rounded-lg',
            tab === 'sent' && 'bg-background'
          )}
          testID="likes-tab-sent"
        >
          <Text
            className={cn(
              'text-sm font-medium',
              tab === 'sent' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            보낸
          </Text>
        </Pressable>
      </View>

      {user?.id && (
        <View className="flex-1">
          <View style={{ flex: 1, display: tab === 'received' ? 'flex' : 'none' }}>
            <ReceivedLikesList userId={user.id} />
          </View>
          <View style={{ flex: 1, display: tab === 'sent' ? 'flex' : 'none' }}>
            <SentLikesList userId={user.id} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

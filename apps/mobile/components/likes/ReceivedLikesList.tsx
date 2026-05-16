import { FlatList, Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@/components/ui/text';
import { getAge, type LikeWithProfile, useLikesList } from '@/hooks/useLikesList';
import { formatRelativeTime, hoursUntil } from '@/lib/formatters';

import { LikesListSkeleton } from './LikesListSkeleton';
import { ReceivedLikesEmpty } from './ReceivedLikesEmpty';

interface Props {
  userId: string;
}

function ReceivedLikeItem({
  item,
  onPress,
}: {
  item: LikeWithProfile;
  onPress: () => void;
}) {
  const age = getAge(item);
  const isNew = item.read_at === null;
  const isUrgent = hoursUntil(item.expires_at) < 24;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:bg-muted/40"
    >
      <View className="w-14 h-14 rounded-full bg-muted items-center justify-center overflow-hidden">
        <Text className="text-muted-foreground text-xl">
          {(item.counterpart.nickname ?? '?').charAt(0)}
        </Text>
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-base font-semibold">
            {item.counterpart.nickname ?? '—'}
            {age !== null ? ` · ${age}` : ''}
          </Text>
          {isNew && (
            <View className="bg-primary/15 rounded px-1.5 py-0.5">
              <Text className="text-primary text-[10px] font-semibold">NEW</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center mt-1">
          <Text className="text-muted-foreground text-xs">
            {item.counterpart.region_sido ?? '—'} · {formatRelativeTime(item.liked_at)}
          </Text>
          {isUrgent && (
            <Text className="text-destructive text-xs ml-1">· 만료 임박</Text>
          )}
        </View>
      </View>

      <Text className="text-muted-foreground text-lg">›</Text>
    </Pressable>
  );
}

export function ReceivedLikesList({ userId }: Props) {
  const { items, loading, refresh } = useLikesList('received', userId);
  const router = useRouter();

  if (loading) return <LikesListSkeleton />;
  if (items.length === 0) return <ReceivedLikesEmpty />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      refreshing={loading}
      onRefresh={refresh}
      ItemSeparatorComponent={() => <View className="h-px bg-border ml-20" />}
      renderItem={({ item }) => (
        <ReceivedLikeItem
          item={item}
          onPress={() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (router.push as any)({
              pathname: '/likes/received/[id]',
              params: { id: item.id },
            })
          }
        />
      )}
    />
  );
}

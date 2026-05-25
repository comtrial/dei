import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useLikeResolution, type ResolveResult } from '@/hooks/useLikeResolution';
import { cn } from '@/lib/utils';

interface Props {
  likeId: string;
  /** 받은 좋아요 시각 — like_accepted 의 since_received_sec 계산용(선택). */
  likedAt?: string;
  onResolved: (result: ResolveResult) => void;
}

export function ReceivedLikeFooter({ likeId, likedAt, onResolved }: Props) {
  const { accept, reject, pending } = useLikeResolution(likeId, likedAt);

  async function handleAccept() {
    const result = await accept();
    onResolved(result);
  }

  async function handleReject() {
    const result = await reject();
    onResolved(result);
  }

  return (
    <View className="bg-background border-t border-border">
      <View className="flex-row gap-2 px-4 py-3">
        <Pressable
          onPress={handleReject}
          disabled={pending}
          className={cn(
            'flex-1 border border-border rounded-xl py-3 items-center active:opacity-70',
            pending && 'opacity-50'
          )}
          testID="received-like-reject"
        >
          <Text className="text-foreground font-medium">거절</Text>
        </Pressable>
        <Pressable
          onPress={handleAccept}
          disabled={pending}
          className={cn(
            'flex-1 bg-primary rounded-xl py-3 items-center active:opacity-70 flex-row justify-center gap-1',
            pending && 'opacity-50'
          )}
          testID="received-like-accept"
        >
          <Text className="text-primary-foreground">🤍</Text>
          <Text className="text-primary-foreground font-medium">수락</Text>
        </Pressable>
      </View>
    </View>
  );
}

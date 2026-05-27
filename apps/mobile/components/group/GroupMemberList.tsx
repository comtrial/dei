/**
 * GroupMemberList — 묶음 멤버 리스트.
 *
 * 두 가지 용도:
 *   1) `group/new.tsx` 의 "선택된 초대 대상" 목록 (removable=true, isInActiveRoom은 단순 표시)
 *   2) `group/[groupId].tsx` 의 "현재 묶음 멤버" 목록 (useGroup 결과, removable=false)
 *
 * `isInActiveRoom` 면 회색 텍스트 + "다른 방 사용 중" 뱃지 표시.
 */
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { NicknameSearchResult } from '@/lib/group/groups-service';

/** new.tsx 에서 사용하는 선택 항목 형태 (nickname 은 null 가능 — useGroup 결과와 호환) */
export type PendingMember = Omit<Pick<NicknameSearchResult, 'userId' | 'nickname' | 'isInActiveRoom'>, 'nickname'> & {
  nickname: string | null;
};

type Props =
  | {
      members: PendingMember[];
      removable: true;
      onRemove: (userId: string) => void;
    }
  | {
      members: PendingMember[];
      removable?: false;
      onRemove?: never;
    };

export function GroupMemberList({ members, removable, onRemove }: Props) {
  if (members.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground text-center py-3">
        아직 추가한 친구가 없어요
      </Text>
    );
  }

  return (
    <View>
      {members.map((member) => (
        <View
          key={member.userId}
          className="flex-row items-center justify-between py-2 border-b border-border/40">
          <View className="flex-1 mr-3">
            <Text
              className={member.isInActiveRoom ? 'text-muted-foreground' : 'text-foreground'}>
              {member.nickname ?? member.userId}
            </Text>
            {member.isInActiveRoom && (
              <Text className="text-xs text-destructive">다른 방 사용 중</Text>
            )}
          </View>
          {removable && onRemove ? (
            <Pressable
              testID={`group-member-remove-${member.userId}`}
              onPress={() => onRemove(member.userId)}
              className="px-3 py-1 rounded-lg bg-muted active:opacity-70">
              <Text className="text-xs text-muted-foreground">제거</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

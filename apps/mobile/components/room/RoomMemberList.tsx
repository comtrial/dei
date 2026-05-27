/**
 * RoomMemberList — 방 멤버 목록.
 *
 * 상태별 표시:
 *   active  → 정상
 *   left    → 회색 + "나감"
 *   auto_kicked → 회색 + "자동 퇴장"
 *
 * 본인이 아닌 active 멤버는 long-press → MemberActionSheet 진입.
 */
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';

type Props = {
  members: RoomMemberWithProfile[];
  myProfileId: string | null | undefined;
  onAction: (member: RoomMemberWithProfile) => void;
};

const STATUS_LABEL: Record<RoomMemberWithProfile['status'], string> = {
  active: '',
  left: '나감',
  auto_kicked: '자동 퇴장',
};

export function RoomMemberList({ members, myProfileId, onAction }: Props) {
  return (
    <View>
      {members.map((member) => {
        const isMe = member.profileId === myProfileId;
        const isActive = member.status === 'active';
        const canAction = !isMe && isActive;

        return (
          <Pressable
            key={member.profileId}
            testID={`room-member-action-${member.profileId}`}
            onLongPress={() => canAction && onAction(member)}
            delayLongPress={400}
            className={[
              'flex-row items-center justify-between py-3 border-b border-border/40',
              canAction ? 'active:opacity-70' : '',
            ].join(' ')}>
            <View className="flex-1">
              <Text
                className={[
                  'text-sm font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                ].join(' ')}>
                {member.nickname ?? member.profileId.slice(0, 8)}
                {isMe ? ' (나)' : ''}
              </Text>
              {member.gender && (
                <Text className="text-xs text-muted-foreground">
                  {member.gender === 'M' ? '남' : member.gender === 'F' ? '여' : '기타'}
                </Text>
              )}
            </View>
            {member.status !== 'active' && (
              <View className="bg-muted rounded-full px-2 py-0.5">
                <Text className="text-xs text-muted-foreground">
                  {STATUS_LABEL[member.status]}
                </Text>
              </View>
            )}
            {canAction && (
              <Text className="text-xs text-muted-foreground ml-2">꾹 눌러 메뉴</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

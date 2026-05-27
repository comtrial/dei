/**
 * RoomFeedGrid — 2×N 분할 피드 그리드 (D7: 최대 6명 + 초과 시 스크롤).
 *
 * 각 멤버의 가장 최신 FeedCell 을 1개씩 표시.
 * 멤버가 아직 업로드 안 했거나 차단된 경우 → PlaceholderCell.
 * 본인 셀은 "내 영상" 뱃지 표시.
 */
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { RoomFeedCell, RoomFeedPlaceholderCell } from '@/components/room/RoomFeedCell';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';
import type { FeedCell } from '@/lib/rooms/types';

const GAP = 8;
const PADDING = 16;

type Props = {
  cells: FeedCell[];
  members: RoomMemberWithProfile[];
  myProfileId: string | null | undefined;
  onCellPress?: (cell: FeedCell) => void;
};

export function RoomFeedGrid({ cells, members, myProfileId, onCellPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();

  const cellWidth = (screenWidth - PADDING * 2 - GAP) / 2;
  const cellHeight = cellWidth * (4 / 3);

  // 멤버당 최신 셀 1개
  const latestByMember = new Map<string, FeedCell>();
  for (const cell of cells) {
    const existing = latestByMember.get(cell.profileId);
    if (!existing || cell.uploadedAt > existing.uploadedAt) {
      latestByMember.set(cell.profileId, cell);
    }
  }

  const activeMembers = members.filter((m) => m.status === 'active');

  return (
    <ScrollView
      contentContainerStyle={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GAP,
        paddingHorizontal: PADDING,
        paddingVertical: PADDING,
      }}>
      {activeMembers.map((member) => {
        const cell = latestByMember.get(member.profileId);
        const isMe = member.profileId === myProfileId;

        return (
          <View key={member.profileId} style={{ position: 'relative' }}>
            {cell ? (
              <RoomFeedCell
                cell={cell}
                width={cellWidth}
                height={cellHeight}
                onPress={onCellPress}
              />
            ) : (
              <RoomFeedPlaceholderCell
                width={cellWidth}
                height={cellHeight}
                reason="no-upload"
              />
            )}
            {isMe && (
              <View className="absolute top-2 left-2 bg-primary/80 rounded-full px-2 py-0.5">
                <Text className="text-xs text-primary-foreground font-medium">나</Text>
              </View>
            )}
            {member.nickname && (
              <View className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 rounded-b-xl">
                <Text className="text-xs text-white" numberOfLines={1}>
                  {member.nickname}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {activeMembers.length === 0 && (
        <View className="flex-1 items-center justify-center py-8">
          <Text className="text-sm text-muted-foreground">멤버가 없어요</Text>
        </View>
      )}
    </ScrollView>
  );
}

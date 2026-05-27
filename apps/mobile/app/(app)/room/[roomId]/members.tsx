/**
 * RoomMembersScreen — 방 멤버 목록 + 차단/신고 진입 (그림 B 입구).
 *
 * long-press → MemberActionSheet → BlockConfirmDialog / ReportReasonSheet.
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockConfirmDialog } from '@/components/room/BlockConfirmDialog';
import { MemberActionSheet } from '@/components/room/MemberActionSheet';
import { ReportReasonSheet } from '@/components/room/ReportReasonSheet';
import { RoomMemberList } from '@/components/room/RoomMemberList';
import { Text } from '@/components/ui/text';
import { logger } from '@dei/shared';
import { type RoomMemberWithProfile, useRoomMembers } from '@/hooks/useRoomMembers';
import { type ReportReasonCode, blockUser, reportUser } from '@/lib/rooms/rooms-service';
import { useAuth } from '@/providers/auth-provider';

type Sheet = 'action' | 'block-confirm' | 'report';

export default function RoomMembersScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

  const { members, loading, refresh } = useRoomMembers(roomId);

  const [targetMember, setTargetMember] = useState<RoomMemberWithProfile | null>(null);
  const [activeSheet, setActiveSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openAction = useCallback((member: RoomMemberWithProfile) => {
    setTargetMember(member);
    setActiveSheet('action');
    setErrorMsg(null);
  }, []);

  const handleBlock = useCallback(async () => {
    if (!targetMember || !roomId) return;
    setBusy(true);
    try {
      await blockUser({ blockedId: targetMember.profileId, sourceRoomId: roomId });
      setActiveSheet(null);
      setTargetMember(null);
      void refresh();
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'rooms', screen: 'members', action: 'block' },
      });
      setErrorMsg('차단에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }, [targetMember, roomId, refresh]);

  const handleReport = useCallback(
    async (reasonCode: ReportReasonCode, reasonDetail: string | null) => {
      if (!targetMember || !roomId) return;
      setBusy(true);
      try {
        await reportUser({
          reportedId: targetMember.profileId,
          reasonCode,
          reasonDetail,
          roomId,
        });
        setActiveSheet(null);
        setTargetMember(null);
      } catch (err) {
        logger.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { feature: 'rooms', screen: 'members', action: 'report' },
        });
        setErrorMsg('신고에 실패했어요. 다시 시도해 주세요.');
      } finally {
        setBusy(false);
      }
    },
    [targetMember, roomId],
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-5 py-4"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        <Text className="text-lg font-semibold text-foreground mb-4">
          멤버 ({members.filter((m) => m.status === 'active').length}명 활성)
        </Text>

        {errorMsg && (
          <View className="bg-destructive/10 rounded-xl p-3 mb-4">
            <Text className="text-sm text-destructive">{errorMsg}</Text>
          </View>
        )}

        <RoomMemberList
          members={members}
          myProfileId={user?.id}
          onAction={openAction}
        />
      </ScrollView>

      {/* 차단/신고 시트 */}
      {activeSheet === 'action' && targetMember && roomId ? (
        <MemberActionSheet
          member={targetMember}
          roomId={roomId}
          onBlock={() => setActiveSheet('block-confirm')}
          onReport={() => setActiveSheet('report')}
          onClose={() => { setActiveSheet(null); setTargetMember(null); }}
        />
      ) : null}

      {activeSheet === 'block-confirm' && targetMember ? (
        <BlockConfirmDialog
          member={targetMember}
          busy={busy}
          onConfirm={handleBlock}
          onCancel={() => setActiveSheet('action')}
        />
      ) : null}

      {activeSheet === 'report' && (
        <ReportReasonSheet
          visible
          busy={busy}
          onSubmit={handleReport}
          onCancel={() => setActiveSheet('action')}
        />
      )}
    </SafeAreaView>
  );
}

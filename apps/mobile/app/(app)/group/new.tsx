/**
 * GroupNewScreen — 묶음 생성 화면.
 *
 * 홈(자유 상태)에서 "친구들과 과팅하기" CTA → 이 화면.
 * 흐름:
 *   닉네임 검색 → 친구 추가 (최대 3명) → "묶음 만들기" 버튼 → `createGroup(nicknames)`
 *   → `/group/[groupId]` 로 이동 (멤버 가용성 확인 + 매칭 시작).
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupInviteSearch } from '@/components/group/GroupInviteSearch';
import { GroupMemberList, type PendingMember } from '@/components/group/GroupMemberList';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { logger } from '@dei/shared';
import { type NicknameSearchResult, createGroup } from '@/lib/group/groups-service';

const MAX_INVITEES = 3; // 본인 포함 최대 4명 → 초대 가능 3명

export default function GroupNewScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<PendingMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedIds = new Set(selected.map((m) => m.userId));

  const handleAdd = useCallback((result: NicknameSearchResult) => {
    setSelected((prev) => {
      if (prev.some((m) => m.userId === result.userId)) return prev;
      if (prev.length >= MAX_INVITEES) return prev;
      return [...prev, { userId: result.userId, nickname: result.nickname, isInActiveRoom: result.isInActiveRoom }];
    });
  }, []);

  const handleRemove = useCallback((userId: string) => {
    setSelected((prev) => prev.filter((m) => m.userId !== userId));
  }, []);

  const handleCreate = useCallback(async () => {
    if (selected.length === 0) {
      setErrorMsg('최소 한 명의 친구를 추가해야 묶음을 만들 수 있어요.');
      return;
    }
    setCreating(true);
    setErrorMsg(null);

    try {
      const nicknames = selected.map((m) => m.nickname ?? '');
      const { groupId } = await createGroup(nicknames);
      router.replace(`/group/${groupId}` as never);
    } catch (err) {
      logger.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: 'group', screen: 'group-new', action: 'create' },
      });
      setErrorMsg('묶음 생성에 실패했어요. 닉네임을 확인하고 다시 시도해 주세요.');
      setCreating(false);
    }
  }, [selected, router]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-5 py-6 gap-5"
        keyboardShouldPersistTaps="handled">
        {/* 헤더 */}
        <View>
          <Text className="text-2xl font-semibold text-foreground mb-1">묶음 만들기</Text>
          <Text className="text-sm text-muted-foreground">
            함께 과팅할 친구를 닉네임으로 초대해요. 최대 {MAX_INVITEES}명까지 초대할 수 있어요.
          </Text>
        </View>

        {/* 추가된 멤버 리스트 */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            추가된 친구 ({selected.length}/{MAX_INVITEES})
          </Text>
          <GroupMemberList
            members={selected}
            removable
            onRemove={handleRemove}
          />
        </View>

        {/* 닉네임 검색 */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            친구 검색
          </Text>
          <GroupInviteSearch
            selectedIds={selectedIds}
            onAdd={handleAdd}
            maxInvitees={MAX_INVITEES}
          />
        </View>

        {/* 에러 메시지 */}
        {errorMsg ? (
          <View className="rounded-xl bg-destructive/10 p-4">
            <Text className="text-sm text-destructive">{errorMsg}</Text>
          </View>
        ) : null}

        {/* 묶음 만들기 버튼 */}
        <Button
          testID="group-new-create"
          onPress={handleCreate}
          disabled={creating || selected.length === 0}>
          <Text>{creating ? '만드는 중…' : '묶음 만들기'}</Text>
        </Button>

        <Button
          testID="group-new-cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={creating}>
          <Text>취소</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * GroupInviteSearch — 닉네임 검색 입력 + 결과 리스트 + 추가 버튼.
 *
 * - 1글자 이상 입력 시 `searchProfileByNickname` 호출 (300ms debounce)
 * - 이미 선택된 유저는 비활성 표시
 * - `is_in_active_room` 인 유저도 회색으로 표시하되 선택 가능 (경고는 GroupMemberList)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  type NicknameSearchResult,
  searchProfileByNickname,
} from '@/lib/group/groups-service';

type Props = {
  selectedIds: Set<string>;
  onAdd: (result: NicknameSearchResult) => void;
  /** 최대 초대 인원 (본인 제외). 기본 3 (묶음 최대 4명 − 리더 1) */
  maxInvitees?: number;
};

export function GroupInviteSearch({ selectedIds, onAdd, maxInvitees = 3 }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NicknameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await searchProfileByNickname(trimmed);
    setResults(found);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  const isFull = selectedIds.size >= maxInvitees;

  return (
    <View className="gap-2">
      <Input
        testID="group-invite-search-input"
        placeholder="닉네임으로 검색"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {searching && (
        <View className="items-center py-2">
          <ActivityIndicator size="small" />
        </View>
      )}

      {!searching && results.length === 0 && query.trim().length > 0 && (
        <Text className="text-sm text-muted-foreground text-center py-2">
          검색 결과가 없어요
        </Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.userId}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const alreadyAdded = selectedIds.has(item.userId);
          const disabled = alreadyAdded || isFull;

          return (
            <View className="flex-row items-center justify-between py-2 border-b border-border/40">
              <View className="flex-1 mr-3">
                <Text
                  className={
                    alreadyAdded || item.isInActiveRoom
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                  }>
                  {item.nickname}
                </Text>
                {item.isInActiveRoom && (
                  <Text className="text-xs text-muted-foreground">다른 방 사용 중</Text>
                )}
              </View>
              <Button
                testID={`group-invite-add-${item.userId}`}
                variant={alreadyAdded ? 'secondary' : 'default'}
                size="sm"
                disabled={disabled}
                onPress={() => onAdd(item)}>
                <Text>{alreadyAdded ? '추가됨' : isFull ? '가득 참' : '추가'}</Text>
              </Button>
            </View>
          );
        }}
      />
    </View>
  );
}

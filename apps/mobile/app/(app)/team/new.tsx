import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import {
  AlertDialog,
  Avatar,
  Badge,
  Banner,
  BottomActionBar,
  Button,
  Card,
  Chip,
  Input,
  Text,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { MOCK_SEARCH_RESULTS, MOCK_SELF_PROFILE, normalizeNickname, toInitial } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type SearchMember = {
  busy: boolean;
  id: string;
  initial: string;
  nickname: string;
};

const SELF_MEMBER: SearchMember = {
  busy: false,
  id: 'self',
  initial: MOCK_SELF_PROFILE.initial,
  nickname: MOCK_SELF_PROFILE.nickname,
};

export default function TeamNewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<SearchMember[]>([SELF_MEMBER]);
  const [results, setResults] = useState<SearchMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);

  useEffect(() => {
    const normalized = normalizeNickname(query);
    if (!normalized) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      void logger.withErrorCapture(
        'team.search-nickname',
        async () => {
          const request = supabase
            .from('profile')
            .select('user_id, nickname, is_in_active_room')
            .ilike('nickname', `%${normalized}%`)
            .limit(5);

          const { data, error } = user
            ? await request.neq('user_id', user.id)
            : await request;

          if (error) {
            throw error;
          }

          const next =
            data && data.length > 0
              ? data.map((profile) => ({
                  busy: profile.is_in_active_room,
                  id: profile.user_id,
                  initial: toInitial(profile.nickname),
                  nickname: profile.nickname ?? '이름 없음',
                }))
              : MOCK_SEARCH_RESULTS.filter((item) => item.nickname.includes(normalized)).map(
                  (item) => ({
                    busy: item.status === 'busy',
                    id: item.id,
                    initial: item.initial,
                    nickname: item.nickname,
                  }),
                );

          setResults(next);
        },
        { tags: { screen: 'team-new', action: 'search' } },
      )
        .catch((error) => {
          logger.captureException(error, {
            tags: { screen: 'team-new', action: 'search-catch' },
          });
          setSearchFailed(true);
        })
        .finally(() => setIsSearching(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [query, user]);

  const addedIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const hasBusyMember = members.some((member) => member.busy);
  const canStart = members.length >= POLICY.team.minMembers && !hasBusyMember;

  const addMember = (member: SearchMember) => {
    if (member.busy || addedIds.has(member.id) || members.length >= POLICY.team.maxMembers) {
      return;
    }
    setMembers((current) => [...current, member]);
  };

  const startQueue = () => {
    if (!canStart) {
      setQueueFailed(true);
      return;
    }

    analytics.capture(ANALYTICS_EVENTS.team_queue_registered, {
      member_count: members.length,
      mode: 'team',
    });
    router.push(ROUTES.permissionNotification);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        title="친구와 함께"
        onLeftPress={() => router.back()}
        rightActions={<Badge variant="count">{`${members.length} / ${POLICY.team.maxMembers}`}</Badge>}
      />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[20px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            닉네임으로 친구를 추가해요
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            수락 절차 없이 바로 묶음에 포함돼요. 다른 방에 있는 친구는 큐 등록 전에 조정해야 해요.
          </Text>

          <View className="mt-[24px]">
            <Text variant="eyebrow" tone="ink-3">
              내 묶음
            </Text>
            <View className="mt-[10px] flex-row flex-wrap gap-[8px]">
              {members.map((member) => (
                <Chip
                  key={member.id}
                  variant={member.id === 'self' ? 'me' : member.busy ? 'busy' : 'default'}
                  label={member.nickname}
                  badge={member.id === 'self' ? '나' : undefined}
                  avatar={<Avatar initial={member.initial} size={24} />}
                  removable={member.id !== 'self'}
                  onRemove={() => setMembers((current) => current.filter((item) => item.id !== member.id))}
                />
              ))}
            </View>
          </View>

          {hasBusyMember ? (
            <Banner tone="warn" icon="!" title="큐 등록 전 확인">
              다른 방에 있는 친구가 있어요. 자동 제외하지 않고 직접 조정해야 합니다.
            </Banner>
          ) : null}

          <Input
            prefixIcon
            value={query}
            onChangeText={setQuery}
            label="친구 검색"
            placeholder="친구 닉네임"
            helper={isSearching ? '검색 중이에요.' : '닉네임은 정확히 공개 프로필 기준으로 검색돼요.'}
            className="mt-[26px]"
          />

          <View className="mt-[18px] gap-[10px]">
            {query && results.length === 0 && !isSearching ? (
              <Card className="items-center px-[18px] py-[24px]">
                <Text className="text-[14px] font-bold text-ink">그런 닉네임의 친구가 없어요</Text>
                <Text className="mt-[4px] text-center text-[12px] leading-[18px] text-ink-3">
                  철자나 띄어쓰기를 다시 확인해주세요.
                </Text>
              </Card>
            ) : null}

            {results.map((member) => (
              <Card key={member.id} className="flex-row items-center gap-[12px] px-[14px] py-[14px]">
                <Avatar initial={member.initial} size={36} />
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-ink">{member.nickname}</Text>
                  <Text className="mt-[2px] text-[11.5px] text-ink-3">
                    {member.busy ? '다른 방에 있어요' : '초대 가능'}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant={member.busy || addedIds.has(member.id) ? 'secondary' : 'ink'}
                  disabled={member.busy || addedIds.has(member.id)}
                  onPress={() => addMember(member)}
                >
                  {addedIds.has(member.id) ? '추가됨' : '추가'}
                </Button>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={!canStart} onPress={startQueue}>
          {members.length}명으로 매칭 시작
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={searchFailed}
        tone="warn"
        icon="!"
        title="친구를 검색하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 검색해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSearchFailed(false) }]}
        onDismiss={() => setSearchFailed(false)}
      />

      <AlertDialog
        visible={queueFailed}
        tone="warn"
        icon="!"
        title="큐에 들어갈 수 없어요"
        description="묶음 인원과 busy 상태를 다시 확인해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setQueueFailed(false) }]}
        onDismiss={() => setQueueFailed(false)}
      />
    </SafeAreaView>
  );
}

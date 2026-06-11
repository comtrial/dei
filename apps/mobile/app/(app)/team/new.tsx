import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Tables } from '@dei/api';
import {
  analytics,
  collegeProfileCompleted,
  COLLEGE_GWATING_MIN_MEMBERS,
  logger,
  POLICY,
  toMatchQueueMode,
} from '@dei/shared';
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
import { isUuidLike, normalizeNickname, toInitial } from '@/lib/b-flow';
import { enqueueMatchQueue, isMatchQueueErrorCode } from '@/lib/matching';
import { needsNotificationConsent, registerPushToken } from '@/lib/notifications.stub';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type SearchMember = {
  blocked: boolean;
  busy: boolean;
  id: string;
  initial: string;
  collegeEligible: boolean;
  nickname: string;
};

const SELF_MEMBER: SearchMember = {
  blocked: false,
  busy: false,
  collegeEligible: false,
  id: 'self',
  initial: '나',
  nickname: '나',
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type SearchProfile = Pick<
  Tables<'profile'>,
  'is_in_active_room' | 'is_student' | 'nickname' | 'university_name' | 'user_id'
>;

export default function TeamNewScreen() {
  const router = useRouter();
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const { user } = useAuth();
  const mode = toMatchQueueMode(rawMode);
  const isCollegeMode = mode === 'college';
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<SearchMember[]>([SELF_MEMBER]);
  const [results, setResults] = useState<SearchMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searchFailed, setSearchFailed] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);
  const [queueFailedMessage, setQueueFailedMessage] = useState(
    '묶음 인원과 busy 상태를 다시 확인해주세요.',
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'team.load-self',
      async () => {
        const { data, error } = await supabase
          .from('profile')
          .select('is_student, nickname, university_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setMembers((current) =>
          current.map((member) =>
            member.id === 'self'
              ? {
                  ...member,
                  collegeEligible: collegeProfileCompleted({
                    isStudent: data?.is_student,
                    universityName: data?.university_name,
                  }),
                  id: user.id,
                  initial: toInitial(data?.nickname),
                  nickname: data?.nickname ?? member.nickname,
                }
              : member,
          ),
        );
      },
      { tags: { screen: 'team-new', action: 'load-self' } },
    );
  }, [user]);

  useEffect(() => {
    const normalized = normalizeNickname(query);
    if (!normalized) {
      setResults((current) => (current.length > 0 ? [] : current));
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      void logger.withErrorCapture(
        'team.search-nickname',
        async () => {
          const request = supabase
            .from('profile')
            .select('user_id, nickname, is_in_active_room, is_student, university_name')
            .ilike('nickname', `%${normalized}%`)
            .limit(5);

          const { data, error } = user
            ? await request.neq('user_id', user.id)
            : await request;

          if (error) {
            throw error;
          }

          const profiles = (data ?? []) as SearchProfile[];
          const next = await Promise.all(
            profiles.map(async (profile) => {
              const { data: blocked, error: blockedError } = user
                ? await supabase.rpc('is_blocked_between', {
                    a: user.id,
                    b: profile.user_id,
                  })
                : { data: false, error: null };

              if (blockedError) {
                throw blockedError;
              }

              return {
                blocked: Boolean(blocked),
                busy: profile.is_in_active_room,
                collegeEligible: collegeProfileCompleted({
                  isStudent: profile.is_student,
                  universityName: profile.university_name,
                }),
                id: profile.user_id,
                initial: toInitial(profile.nickname),
                nickname: profile.nickname ?? '이름 없음',
              };
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
  }, [query, searchAttempt, user]);

  const addedIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const hasBusyMember = members.some((member) => member.busy);
  const hasCollegeIneligibleMember = isCollegeMode
    && members.some((member) => !member.collegeEligible);
  const minMembers = isCollegeMode ? COLLEGE_GWATING_MIN_MEMBERS : POLICY.team.minMembers;
  const canStart =
    Boolean(user)
    && members.length >= minMembers
    && members.every((member) => isUuidLike(member.id))
    && !hasBusyMember
    && !hasCollegeIneligibleMember;

  const addMember = (member: SearchMember) => {
    if (
      member.blocked
      || member.busy
      || (isCollegeMode && !member.collegeEligible)
      || addedIds.has(member.id)
      || members.length >= POLICY.team.maxMembers
    ) {
      return;
    }
    setMembers((current) => [...current, member]);
  };

  const startQueue = () => {
    if (!canStart) {
      setQueueFailedMessage(
        hasCollegeIneligibleMember
          ? '과팅은 팀원 모두 재학중이고 대학명을 입력해야 시작할 수 있어요.'
          : isCollegeMode && members.length < minMembers
            ? '과팅은 친구를 1명 이상 추가해야 시작할 수 있어요.'
          : '묶음 인원과 busy 상태를 다시 확인해주세요.',
      );
      setQueueFailed(true);
      return;
    }

    void logger.withErrorCapture(
      'team.start-queue',
      async () => {
        const memberIds = members.map((member) => member.id).filter(Boolean);
        if (!user?.id || (await needsNotificationConsent(user.id))) {
          router.push({
            pathname: '/(app)/permission/notification',
            params: { memberIds: memberIds.join(','), mode },
          });
          return;
        }

        await registerPushToken(user.id).catch((error) => {
          logger.captureMessage('push token registration skipped', 'warning', {
            tags: { screen: 'team-new', action: 'register-push-token' },
            extra: { reason: getErrorMessage(error) },
          });
        });

        const registration = await enqueueMatchQueue(memberIds, { mode });
        analytics.capture(ANALYTICS_EVENTS.team_queue_registered, {
          member_count: members.length,
          mode: isCollegeMode ? 'college' : 'team',
        });
        // 큐 등록 = 커밋 상태. 홈/팀구성 화면을 스택에서 제거(replace)해
        // 뒤로가기로 취소 없이 빠져나가는 상태 불일치를 막는다.
        if (registration.freeRematchWaived) {
          router.replace({
            pathname: '/(app)/queue',
            params: { mode, notice: 'free-rematch' },
          });
          return;
        }

        router.replace({
          pathname: '/(app)/queue',
          params: { mode },
        });
      },
      { tags: { screen: 'team-new', action: 'start-queue' } },
    ).catch((error) => {
      if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
        router.push({
          pathname: '/(app)/booster',
          params: { memberIds: members.map((member) => member.id).join(','), mode },
        });
        return;
      }

      if (isMatchQueueErrorCode(error, 'COLLEGE_PROFILE_REQUIRED')) {
        setQueueFailedMessage('과팅은 대학생 프로필을 완료한 친구만 참여할 수 있어요.');
        setQueueFailed(true);
        return;
      }

      logger.captureException(error, {
        tags: { screen: 'team-new', action: 'start-queue-catch' },
      });
      setQueueFailed(true);
    });
  };

  const firstBusyMember = members.find((member) => member.busy);
  const firstCollegeIneligibleMember = members.find((member) => !member.collegeEligible);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        title={isCollegeMode ? '과팅 팀' : '친구 초대'}
        onLeftPress={() => router.back()}
        rightActions={<Badge variant="count">{`${members.length} / ${POLICY.team.maxMembers}`}</Badge>}
      />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[20px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            같이 갈 친구를{'\n'}닉네임으로 불러봐
          </Text>
          <Text className="mt-[8px] text-[15.5px] leading-[20px] text-ink-3">
            {isCollegeMode
              ? '팀원 모두 대학생 프로필을 완료해야 해요'
              : '수락 절차 없이 초대자가 바로 진행해요'}
          </Text>

          <Input
            prefixIcon
            value={query}
            onChangeText={setQuery}
            label="친구 검색"
            placeholder="닉네임으로 검색"
            helper={isSearching ? '검색 중이에요.' : '닉네임은 정확히 공개 프로필 기준으로 검색돼요.'}
            className="mt-[24px]"
          />

          <View className="mt-[18px] gap-[10px]">
            {query && results.length === 0 && !isSearching ? (
              <Card className="items-center px-[18px] py-[24px]">
                <Text className="text-[16px] font-bold text-ink">그런 닉네임의 친구가 없어요</Text>
                <Text className="mt-[4px] text-center text-[14px] leading-[18px] text-ink-3">
                  철자나 띄어쓰기를 다시 확인해주세요.
                </Text>
              </Card>
            ) : null}

            {results.map((member) => (
              <Card key={member.id} className="flex-row items-center gap-[12px] px-[14px] py-[14px]">
                <Avatar initial={member.initial} size={36} />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold text-ink">{member.nickname}</Text>
                  <Text className="mt-[2px] text-[13.5px] text-ink-3">
                    {member.blocked
                      ? '초대할 수 없는 친구예요'
                      : member.busy
                        ? '다른 방 사용 중이에요'
                        : isCollegeMode && !member.collegeEligible
                          ? '대학생 프로필이 필요해요'
                          : '초대 가능'}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant={
                    member.blocked
                    || member.busy
                    || (isCollegeMode && !member.collegeEligible)
                    || addedIds.has(member.id)
                      ? 'secondary'
                      : 'ink'
                  }
                  disabled={
                    member.blocked
                    || member.busy
                    || (isCollegeMode && !member.collegeEligible)
                    || addedIds.has(member.id)
                  }
                  onPress={() => addMember(member)}
                >
                  {addedIds.has(member.id) ? '추가됨' : '+ 추가'}
                </Button>
              </Card>
            ))}
          </View>

          <View className="mt-[24px]">
            <Text variant="eyebrow" tone="ink-3">
              내 묶음
            </Text>
            <View className="mt-[10px] flex-row flex-wrap gap-[8px]">
              {members.map((member) => (
                <Chip
                  key={member.id}
                  variant={member.id === user?.id ? 'me' : member.busy ? 'busy' : 'default'}
                  label={member.nickname}
                  badge={member.id === user?.id ? '초대한 사람' : undefined}
                  avatar={<Avatar initial={member.initial} size={24} />}
                  removable={member.id !== user?.id}
                  onRemove={() => setMembers((current) => current.filter((item) => item.id !== member.id))}
                />
              ))}
              {members.length < POLICY.team.maxMembers ? (
                <Chip
                  variant="add"
                  label="+ 친구"
                  accessibilityRole="text"
                />
              ) : null}
            </View>
          </View>

          {hasBusyMember ? (
            <Banner tone="warn" icon="!" title="큐 등록 전 확인">
              {firstBusyMember?.nickname ?? '친구'}가 다른 방 사용 중이에요. 빼거나 다른 친구를 초대해주세요.
            </Banner>
          ) : null}

          {hasCollegeIneligibleMember ? (
            <Banner tone="warn" icon="!" title="과팅 팀 조건">
              {firstCollegeIneligibleMember?.nickname ?? '친구'}의 대학생 프로필이 필요해요.
            </Banner>
          ) : null}
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={!canStart} onPress={startQueue}>
          {isCollegeMode && members.length < minMembers
            ? '친구를 1명 이상 추가해주세요'
            : hasBusyMember || hasCollegeIneligibleMember
            ? '매칭 시작 (조정 필요)'
            : `${members.length}명으로 매칭 시작`}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={searchFailed}
        tone="warn"
        icon="!"
        title="친구를 검색하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 검색해주세요."
        actions={[
          { label: '확인', variant: 'secondary', onPress: () => setSearchFailed(false) },
          {
            label: '다시 시도',
            variant: 'ink',
            onPress: () => {
              setSearchFailed(false);
              setSearchAttempt((attempt) => attempt + 1);
            },
          },
        ]}
        onDismiss={() => setSearchFailed(false)}
      />

      <AlertDialog
        visible={queueFailed}
        tone="warn"
        icon="!"
        title="큐에 들어갈 수 없어요"
        description={queueFailedMessage}
        actions={[
          { label: '확인', variant: 'secondary', onPress: () => setQueueFailed(false) },
          {
            label: '다시 시도',
            variant: 'ink',
            onPress: () => {
              setQueueFailed(false);
              startQueue();
            },
          },
        ]}
        onDismiss={() => setQueueFailed(false)}
      />
    </SafeAreaView>
  );
}

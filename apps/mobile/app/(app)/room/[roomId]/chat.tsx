import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { analytics, logger } from '@dei/shared';
import { avatarColorFor } from '@dei/ui';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { subscribeRoomMembers, subscribeRoomStatus } from '@/lib/realtime';
import { useRoomChat } from '@/hooks/useRoomChat';
import { RoomChatView } from '@/components/chat/RoomChatView';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { countNewMessages, isNearBottom } from '@/lib/chat/scroll';
import {
  parseMentionQuery,
  resolveTailMention,
  resolveLeadingMention,
  type RoomMemberLite,
} from '@/lib/chat/mention';
import { useChatPresentationMode } from '@/lib/chat/presentation';
import { getCachedRoomChatMembers, setCachedRoomChatMembers } from '@/lib/chat/member-cache';
import { resolveProfilePhotoUrls } from '@/lib/profile-photo-cache';
import { getRoomMembersWithProfile, type RoomMemberWithProfile } from '@/lib/room-rpc';
import { ROUTES } from '@/lib/routes';

/** 방이 종료/삭제됐는지(읽기전용 전환 신호). status active 가 아니거나 ended_at 존재. */
function isRoomEnded(row: { status?: string | null; ended_at?: string | null } | null): boolean {
  if (!row) return false;
  return (row.status != null && row.status !== 'active') || row.ended_at != null;
}

function buildChatMembers(
  roomMembers: RoomMemberWithProfile[],
  photoUrlByUser: Map<string, string>,
): RoomMemberLite[] {
  return roomMembers.map((member) => {
    const name = member.profile?.nickname ?? '익명';
    return {
      userId: member.user_id,
      status: (member.status as RoomMemberLite['status']) ?? 'active',
      name,
      avatarInitial: name[0],
      // photoUrl 없을 때 이니셜 배경을 userId 결정색으로(멤버 식별·재렌더 안정).
      avatarBg: avatarColorFor(member.user_id),
      photoUrl: photoUrlByUser.get(member.user_id) ?? member.profile?.avatar_url ?? undefined,
      profile: member.profile
        ? {
            ...member.profile,
            avatar_url: photoUrlByUser.get(member.user_id) ?? member.profile.avatar_url ?? null,
          }
        : undefined,
    };
  });
}

type ProfileRow = {
  bio: string | null;
  birth_year: number | null;
  gender: string | null;
  mbti: string | null;
  nickname: string | null;
  photo_url: string | null;
  region: string | null;
  user_id: string;
};

type RoomMemberUpdateRow = {
  joined_at?: string | null;
  left_at?: string | null;
  role?: string | null;
  room_id?: string | null;
  status?: string | null;
  user_id?: string | null;
};

function memberLeftNoticeBody(name: string, status: string | null | undefined): string {
  return `${name}님이 ${status === 'auto_kicked' ? '자동 퇴장됐어요' : '나갔어요'}`;
}

function toRoomMemberLiteStatus(status: string | null | undefined): RoomMemberLite['status'] {
  if (status === 'left' || status === 'auto_kicked') return status;
  return 'active';
}

/**
 * S13a — 방 내부 채팅 시트 (route 배선).
 * ==================================================================
 * 화면 목적: S13 헤더 채팅 아이콘 → 진입. PRD §3 핵심 메커니즘인
 *           '전체 채팅 + @멘션 귓속말'이 작동하는 단일 화면.
 *
 * 이 파일은 supabase(인증·멤버 조회) + useRoomChat(스트림·송신·구독) +
 * analytics(room_chat_opened / whisper_mention_sent)를 배선해 순수 view
 * `RoomChatView`에 props 로 주입한다. 시각 요소는 전부 @dei/ui DS — raw 스타일 0.
 *
 * realtime 자동스크롤/새 메시지 badge: 스트림이 하단 근처(isNearBottom)면 새
 * 메시지가 와도 inverted FlatList 가 자동으로 최신을 보여주므로 badge 0. 위로
 * 스크롤된 상태에서 메시지가 늘면 newCount 를 증가시켜 '↓ N개 새 메시지' pill 노출,
 * 점프 시 0 으로 리셋(view 가 하단으로 스크롤).
 */
export default function RoomChatScreen() {
  const { roomId: roomIdParam } = useLocalSearchParams<{ roomId?: string | string[] }>();
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  const router = useRouter();
  const { user } = useAuth();
  const [selfId, setSelfId] = useState(() => user?.id ?? '');
  const [members, setMembers] = useState<RoomMemberLite[]>(() =>
    roomId ? getCachedRoomChatMembers(roomId) : [],
  );
  const [input, setInput] = useState('');
  const [whisperTarget, setWhisperTarget] =
    useState<{ userId: string; name: string; avatarInitial?: string; photoUrl?: string } | null>(
      null,
    );
  const [roomEnded, setRoomEnded] = useState(false);
  // 차단 목록(block 기능 도입 시 여기로 주입). 현재는 빈 집합 — 멘션 후보/귓속말
  // 대상 게이트가 일관 동작하도록 contract 만 유지(filterCandidates·resolveTailMention).
  const blockedIds = useMemo(() => new Set<string>(), []);

  // 내 멤버 레코드(헤더 우측 프로필 아바타용).
  const self = useMemo(() => members.find((m) => m.userId === selfId), [members, selfId]);

  // 채팅 진입 방식(피처 플래그). 'overlay' 면 영상 위 반투명 레이어(scrim/dark band),
  // 아니면 기존 불투명 화면. 라우트 presentation 은 (app)/_layout 이 같은 플래그로 결정.
  const overlay = useChatPresentationMode() === 'overlay';

  const { messages, send, retry, addSystemMessage, isInitialLoading } = useRoomChat({
    roomId: roomId ?? '',
    selfId,
  });
  const membersRef = useRef(members);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    if (user?.id) setSelfId(user.id);
  }, [user?.id]);

  // 채팅 화면 진입 시 읽음 마킹 → 방 화면 unread 점 사라짐. 실패해도 채팅은
  // 정상 동작(점이 안 사라질 뿐) → 회복 가능, 비동기 경계만 보호하고 캡처만.
  useEffect(() => {
    if (!roomId || !user?.id) return;
    void logger
      .withErrorCapture(
        'room.mark-read',
        async () => {
          const { error } = await supabase.rpc('mark_room_read', { p_room_id: roomId });
          if (error) throw error;
        },
        { tags: { feature: 'chat-unread', room_id: roomId } },
      )
      .catch(() => {});
  }, [roomId, user?.id]);

  useEffect(() => {
    if (!roomId) return;
    const cached = getCachedRoomChatMembers(roomId);
    if (cached.length > 0) setMembers(cached);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const knownUserIds = new Set(members.map((member) => member.userId));
    const missingUserIds = [
      ...new Set(
        messages
          .filter((message) => message.kind !== 'system' && !knownUserIds.has(message.userId))
          .map((message) => message.userId),
      ),
    ];
    if (missingUserIds.length === 0) return;

    let alive = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profile')
          .select('user_id, nickname, gender, birth_year, region, photo_url, bio, mbti')
          .in('user_id', missingUserIds);

        if (error) throw error;

        const profiles = (data ?? []) as ProfileRow[];
        const signedByUser = await resolveProfilePhotoUrls(
          profiles
            .filter((profile) => profile.photo_url)
            .map((profile) => ({
              path: profile.photo_url,
              userId: profile.user_id,
            })),
          { screen: 'room-chat-authors', roomId },
        );

        if (!alive) return;

        setMembers((prev) => {
          const existing = new Set(prev.map((member) => member.userId));
          const additions = profiles
            .filter((profile) => !existing.has(profile.user_id))
            .map((profile): RoomMemberLite => {
              const name = profile.nickname ?? profile.user_id.slice(0, 6);
              const photoUrl = signedByUser.get(profile.user_id);
              return {
                userId: profile.user_id,
                status: 'left',
                name,
                avatarInitial: name[0],
                avatarBg: avatarColorFor(profile.user_id),
                photoUrl,
                profile: {
                  avatar_url: photoUrl ?? null,
                  bio: profile.bio,
                  birth_year: profile.birth_year,
                  gender: profile.gender,
                  mbti: profile.mbti,
                  nickname: profile.nickname,
                  photo_url: profile.photo_url,
                  region: profile.region,
                },
              };
            });

          return additions.length > 0 ? [...prev, ...additions] : prev;
        });
      } catch (err) {
        logger.captureException(err, {
          tags: { screen: 'room-chat', feature: 'message-author-hydration' },
          extra: { room_id: roomId, missing_user_count: missingUserIds.length },
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [members, messages, roomId]);

  // 자동스크롤 vs 새 메시지 badge: 하단 근처면 newCount 0(자동 추종), 위로 올라가
  // 있으면 '남이 보낸' 새 메시지 수만큼 newCount 증가. nearBottom 은 onScroll 로 갱신.
  const [newCount, setNewCount] = useState(0);
  const nearBottomRef = useRef(true);
  const prevMessagesRef = useRef<typeof messages>([]);

  useEffect(() => {
    // concurrency-misc-12: 내가 보낸 낙관 메시지는 pill 에서 제외(id 기준 신규만 카운트).
    const added = countNewMessages(prevMessagesRef.current, messages, selfId);
    prevMessagesRef.current = messages;
    if (added > 0 && !nearBottomRef.current) {
      setNewCount((n) => n + added);
    }
  }, [messages, selfId]);

  const onScroll = useCallback((offsetY: number) => {
    const near = isNearBottom(offsetY);
    nearBottomRef.current = near;
    if (near) setNewCount(0);
  }, []);

  const onJump = useCallback(() => {
    nearBottomRef.current = true;
    setNewCount(0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!roomId) return;
      let alive = true;
      // 부트스트랩 IIFE: getUser 실패 시 selfId 가 '' 로 남아 귓속말 필터·send(userId='')
      // 가 조용히 오작동하므로(사용자 영향 高) 각 쿼리 error 를 throw 해 캡처한다.
      // withErrorCapture 는 재던지므로 void IIFE 에서는 trailing .catch 로 미캐치 방지.
      void logger
        .withErrorCapture(
          'room-chat.bootstrap',
          async () => {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError) throw authError;
            if (alive && auth.user) setSelfId(auth.user.id);

            const roomMembers = await getRoomMembersWithProfile(roomId);
            const avatarByUser = new Map(
              roomMembers
                .filter((m) => m.profile?.avatar_url)
                .map((m) => [m.user_id, m.profile!.avatar_url as string]),
            );
            const photoPaths = roomMembers
              .filter((m) => m.profile?.photo_url && !avatarByUser.has(m.user_id))
              .map((m) => ({ userId: m.user_id, path: m.profile!.photo_url as string }));
            const signedByUser = photoPaths.length
              ? await resolveProfilePhotoUrls(photoPaths, { screen: 'room-chat', roomId })
              : new Map<string, string>();

            if (alive) {
              const photoUrlByUser = new Map([...avatarByUser, ...signedByUser]);
              const mapped = buildChatMembers(roomMembers, photoUrlByUser);
              setCachedRoomChatMembers(roomId, mapped);
              setMembers(mapped);
            }

            // 방 상태(있으면). 실패 시 throw → 캡처. (방 제목은 S13a 재구성에서
            // 헤더에서 제거 — roomName state 불필요.)
            const { data: room, error: roomError } = await supabase
              .from('room')
              .select('id, status, ended_at')
              .eq('id', roomId)
              .maybeSingle();
            if (roomError) throw roomError;
            if (alive && room) {
              // concurrency-misc-9: 진입 시점 종료 여부(읽기전용). 이후 변화는 구독으로 갱신.
              setRoomEnded(isRoomEnded(room));
            }
          },
          { tags: { screen: 'room-chat', feature: 'chat-load' }, extra: { room_id: roomId } },
        )
        .catch(() => {
          // withErrorCapture 가 이미 캡처함 — 여기서는 미캐치 rejection 만 흡수.
        });

      analytics.capture(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
      return () => {
        alive = false;
      };
    }, [roomId]),
  );

  // concurrency-misc-9: 방 상태 realtime 구독 — active→ended/deleted 전이 시 읽기전용
  // 전환(즉시 blank 금지, 스트림은 그대로 보이되 composer disabled). 종료 시 귓속말
  // 대상·입력의 @ 자동완성 잔재를 정리한다.
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeRoomStatus(roomId, (row) => {
      if (isRoomEnded(row)) {
        setRoomEnded(true);
        setWhisperTarget(null);
        // 입력 끝의 미확정 @토큰만 제거(작성 중 본문은 보존 — 즉시 blank 금지).
        setInput((prev) => prev.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, ''));
      }
    });
    return unsub;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeRoomMembers(roomId, (row) => {
      const updated = row as RoomMemberUpdateRow;
      const userId = updated.user_id;
      if (!userId || updated.room_id !== roomId) return;

      const status = updated.status ?? 'active';
      const previous = membersRef.current.find((member) => member.userId === userId);

      if (
        previous?.status === 'active' &&
        (status === 'left' || status === 'auto_kicked')
      ) {
        const createdAt = updated.left_at ?? new Date().toISOString();
        addSystemMessage({
          id: `member-${status}-${roomId}-${userId}-${createdAt}`,
          clientMsgId: null,
          userId,
          body: memberLeftNoticeBody(previous.name, status),
          whisperToUserId: null,
          createdAt,
        });
      }

      setMembers((prev) => {
        const idx = prev.findIndex((member) => member.userId === userId);
        if (idx === -1) {
          const name = userId.slice(0, 6);
          return [
            ...prev,
            {
              userId,
              status: toRoomMemberLiteStatus(status),
              name,
              avatarInitial: name[0],
              avatarBg: avatarColorFor(userId),
            },
          ];
        }

        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: toRoomMemberLiteStatus(status),
        };
        return next;
      });
    });
    return unsub;
  }, [addSystemMessage, roomId]);

  // whisper-mode-5/6/11 (E): 멤버 변동 시 귓속말 대상이 더 이상 active 가 아니거나
  // 차단되면 대상을 해제한다(탭 시점 스냅샷이 members.status 와 어긋나는 레이스 방지).
  useEffect(() => {
    if (!whisperTarget) return;
    const member = members.find((m) => m.userId === whisperTarget.userId);
    if (!member || member.status !== 'active' || blockedIds.has(whisperTarget.userId)) {
      setWhisperTarget(null);
    }
  }, [members, whisperTarget, blockedIds]);

  /** 귓속말 전송(+analytics) 후 컴포저/대상 정리. 내 전송이라 하단 강제 추종. */
  const dispatchSend = useCallback(
    (body: string, whisperToUserId: string | null) => {
      if (!roomId) return;
      void send(body, whisperToUserId).then(() => {
        if (whisperToUserId) {
          analytics.capture(ANALYTICS_EVENTS.whisper_mention_sent, { room_id: roomId });
        }
      });
      // concurrency-misc-12: 내 전송은 항상 하단 추종(pill 에 안 잡히게).
      nearBottomRef.current = true;
      setNewCount(0);
      setInput('');
      setWhisperTarget(null);
    },
    [roomId, send],
  );

  const onSend = () => {
    if (!roomId || roomEnded) return; // concurrency-misc-9: 종료된 방은 클라 선차단.

    if (whisperTarget == null) {
      // Bug4: '@풀네임 본문' 인라인 멘션(이름 뒤에 본문) — 완전·유일 일치면 귓속말.
      if (input.trimStart().startsWith('@')) {
        const lead = resolveLeadingMention(input, members, { selfId, blockedIds });
        if (lead.kind === 'confirmed' && lead.target) {
          dispatchSend(lead.strippedInput ?? input, lead.target.userId);
          return;
        }
        if (lead.kind === 'ambiguous') return; // 평문 오발신 차단(명시 선택 유도).
        // none → 아래 tail/평문 분기로.
      }

      // G-A: 칩 미확정인데 입력 끝이 @토큰이면 재파싱해 누설 차단(tail 케이스).
      if (parseMentionQuery(input).active) {
        const res = resolveTailMention(input, members, { selfId, blockedIds });
        if (res.kind === 'confirmed' && res.target) {
          dispatchSend(res.strippedInput ?? input, res.target.userId);
          return;
        }
        if (res.kind === 'ambiguous') return;
        // none → 평문.
      }
    }

    dispatchSend(input, whisperTarget?.userId ?? null);
  };

  const onSelectMention = (m: RoomMemberLite) => {
    // @쿼리 토큰을 입력에서 제거하고 귓속말 대상 확정(대상 교체 포함).
    setInput((prev) => prev.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, ''));
    setWhisperTarget({
      userId: m.userId,
      name: m.name,
      avatarInitial: m.avatarInitial,
      photoUrl: m.photoUrl,
    });
  };

  return (
    <RoomChatView
      memberCount={members.filter((m) => m.status === 'active').length}
      selfId={selfId}
      selfPhotoUrl={self?.photoUrl}
      selfInitial={self?.avatarInitial}
      selfBg={self?.avatarBg}
      messages={messages}
      members={members}
      input={input}
      whisperTarget={whisperTarget}
      onChangeInput={setInput}
      onSend={onSend}
      onRetry={retry}
      onSelectMention={onSelectMention}
      onClearWhisper={() => setWhisperTarget(null)}
      onAvatarPress={(userId) => {
        if (userId === selfId) {
          router.push(ROUTES.myProfile);
          return;
        }

        const member = members.find((m) => m.userId === userId);
        router.push({
          pathname: '/(app)/room/[roomId]/members',
          params: {
            roomId: roomId ?? '',
            userId,
            ...(member?.name ? { targetNickname: member.name } : {}),
            ...(member?.photoUrl ? { targetAvatarUrl: member.photoUrl } : {}),
          },
        } as never);
      }}
      onSelfProfilePress={() => router.push(ROUTES.myProfile)}
      onClose={() => router.back()}
      newCount={newCount}
      onJump={onJump}
      onScroll={onScroll}
      blockedIds={blockedIds}
      roomEnded={roomEnded}
      isInitialLoading={isInitialLoading}
      overlay={overlay}
      visible
    />
  );
}

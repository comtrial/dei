import { useCallback, useMemo, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  AvatarStack,
  ChatBubble,
  InputBar,
  MentionAutocomplete,
  NewMessageJumpButton,
  StateView,
  Text,
  TopNav,
  type MentionCandidate,
} from '@dei/ui';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat/message-merge';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { filterCandidates, parseMentionQuery } from '@/lib/chat/mention';
import { renderBodyWithMentions } from '@/lib/chat/renderBody';
import { isSendable, MAX_BODY, messageLength } from '@/lib/chat/length';

/**
 * RoomChatView — S13a 방 내부 단체채팅 + @귓속말의 순수 view.
 *
 * 데이터(메시지·멤버·입력·귓속말 대상)와 핸들러를 전부 props 로 받는다.
 * supabase/router/realtime 배선은 route 파일(chat.tsx)이 담당 →
 * 이 컴포넌트는 supabase mock 없이 RNTL 로 직접 렌더·검증 가능하다.
 *
 * 레이아웃(S13a 재구성 — 전체화면):
 *  - 루트는 SafeAreaView(top/bottom) + flex-1 column. (바텀시트 셸 제거)
 *  - 헤더 TopNav: 방 제목 없이 `멤버 N명` 부제 + 우측 멤버 AvatarStack + back.
 *  - 스트림(inverted FlatList) 은 flex-1 로 가용공간 차지, 그 아래 컴포저.
 *  - KeyboardAvoidingView 로 컴포저가 키보드 위로 밀려 올라간다(가림 방지).
 *  - 귓속말: ChatBubble 이 보낸이 아바타 + '귓속말' 태그로 표현(방향 안내 없음).
 *
 * raw 스타일 0(@dei/ui + NativeWind 토큰만). 멘션 후보 필터/길이 게이트는
 * lib/chat 순수로직(parseMentionQuery·filterCandidates·isSendable)을 재사용.
 */
export interface RoomChatViewProps {
  /** @deprecated 헤더 제목 제거(S13a 재구성) — 더 이상 표시하지 않으나 계약 보존용 optional. */
  roomName?: string;
  memberCount: number;
  selfId: string;
  /** 내 프로필 사진 URL(헤더 우측). 없으면 이니셜/색 폴백. */
  selfPhotoUrl?: string;
  /** 내 아바타 이니셜(헤더 우측 폴백). */
  selfInitial?: string;
  /** 내 아바타 bg className(폴백). */
  selfBg?: string;
  messages: ChatMessage[];
  members: RoomMemberLite[];
  input: string;
  whisperTarget: {
    userId: string;
    name: string;
    avatarInitial?: string;
    avatarBg?: string;
    photoUrl?: string;
  } | null;
  onChangeInput: (t: string) => void;
  onSend: () => void;
  onRetry: (clientMsgId: string) => void;
  onSelectMention: (c: RoomMemberLite) => void;
  onClearWhisper: () => void;
  onAvatarPress: (userId: string) => void;
  onSelfProfilePress?: () => void;
  onClose: () => void;
  newCount: number;
  onJump: () => void;
  /** 스트림 스크롤 위치 변화(inverted: offsetY≈0 이 하단). route 가 nearBottom 판정에 사용. */
  onScroll?: (offsetY: number) => void;
  visible: boolean;
  blockedIds?: Set<string>;
  roomEnded?: boolean;
  isInitialLoading?: boolean;
  /**
   * 오버레이 모드(피처 플래그 'overlay'): 매칭된 방 영상 위 반투명 레이어.
   * 루트 배경 투명 + 영상 dim scrim(rgba .45) + 헤더/컴포저 dark band(.62),
   * 본문 transparent(영상 비침). 기본 false = 기존 불투명 화면(legacy).
   */
  overlay?: boolean;
}

function formatChatTime(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;

  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hour24 = kstDate.getUTCHours();
  const hour12 = hour24 % 12 || 12;
  const minute = String(kstDate.getUTCMinutes()).padStart(2, '0');
  const period = hour24 < 12 ? '오전' : '오후';

  return `${period} ${hour12}:${minute}`;
}

export function RoomChatView(props: RoomChatViewProps) {
  const { input, members, selfId, blockedIds, whisperTarget } = props;
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // 점프: inverted 스트림에서 하단(offset 0)으로 이동 후 route 의 newCount 리셋 위임.
  const handleJump = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    props.onJump();
  }, [props]);

  // 멘션 후보: @쿼리가 활성이면 노출(self/blocked/left 제외). 귓속말 대상이 이미
  // 있어도(whisper-mode-2/3, 게이트 F) 본문에 새 @ 를 치면 '대상 교체' 모드로 후보를
  // 다시 보여준다 — onSelectMention 이 setWhisperTarget 로 대상을 덮어쓰므로 어긋난
  // @텍스트가 첫 대상에게 평문으로 박히는 누락을 막는다.
  const candidates: MentionCandidate[] = useMemo(() => {
    const mention = parseMentionQuery(input);
    if (!mention.active) return [];
    return filterCandidates(members, mention.query, {
      selfId,
      blockedIds: blockedIds ?? new Set<string>(),
    }).map((m) => ({
      userId: m.userId,
      name: m.name,
      avatarInitial: m.avatarInitial,
      avatarBg: m.avatarBg,
    }));
  }, [input, members, selfId, blockedIds]);

  const sendable = isSendable(input) && !props.roomEnded;

  // 헤더 멤버 아바타 스택: active 멤버 중 self 제외(이 방에 누가 있나 식별).
  const stackItems = useMemo(
    () =>
      members
        .filter((m) => m.status === 'active' && m.userId !== selfId)
        .map((m) => ({
          userId: m.userId,
          initial: m.avatarInitial,
          bg: m.avatarBg,
          photoUrl: m.photoUrl,
        })),
    [members, selfId],
  );

  if (!props.visible) return null;

  // 오버레이 모드 표면(UX 스펙 2026-06-03): 영상 위 dim scrim(.45) + 본문 transparent
  // + 헤더/컴포저 dark band(.62). 기본(legacy)은 불투명 bg-bg.
  const o = props.overlay === true;
  const rootBg = o ? 'bg-transparent' : 'bg-bg';
  const bandClass = o ? 'bg-[rgba(0,0,0,0.62)]' : 'bg-paper';

  return (
    // KeyboardAvoidingView 를 최상위로 — 키보드가 올라오면 화면 전체 높이를 줄여
    // 컴포저가 키보드 위로 정확히 따라붙는다(이전: SafeArea bottom 과 padding 이
    // 이중 계산돼 입력창 일부가 키보드에 씹힘). iOS=padding, Android=네이티브 adjustResize.
    // top 만 SafeArea(노치) — 하단 인셋은 컴포저가 자체 padding 으로 처리.
    <KeyboardAvoidingView
      testID="room-chat-kav"
      className={cn('flex-1', rootBg)}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 오버레이 모드: 뒤 영상을 누르는 dim scrim(rgba .45). 본문은 이 위에 transparent. */}
      {o ? <View testID="room-chat-scrim" className="absolute inset-0 bg-[rgba(0,0,0,0.45)]" /> : null}
      <SafeAreaView edges={['top']} className={cn('flex-1', rootBg)}>
        <View className="flex-1" testID="room-chat-screen">
          <TopNav
            left="back"
            onDark={o}
            onLeftPress={props.onClose}
            leftAccessibilityLabel="뒤로"
            subtitle={`멤버 ${props.memberCount}명`}
            // 오버레이면 헤더 dark band(.62), 아니면 paper. 좌:멤버 스택 / 우:내 프로필.
            className={o ? bandClass : undefined}
            leftAccessory={stackItems.length > 0 ? <AvatarStack items={stackItems} max={3} size={28} /> : undefined}
            rightActions={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="내 프로필"
                testID="chat-header-my-profile"
                onPress={props.onSelfProfilePress}
              >
                <Avatar
                  size={32}
                  initial={props.selfInitial}
                  photoUrl={props.selfPhotoUrl}
                  bg={props.selfBg}
                  accessibilityLabel="내 프로필 사진"
                />
              </Pressable>
            }
          />
        <View className="flex-1">
          {props.messages.length === 0 && props.isInitialLoading ? (
            <StateView
              kind="loading"
              title="메시지를 불러오고 있어요"
              desc="잠시만 기다려주세요."
            />
          ) : props.messages.length === 0 ? (
            <StateView
              kind="empty"
              icon="💬"
              title="아직 메시지가 없어요"
              desc="첫 메시지를 남겨보세요. @닉네임으로 귓속말도 보낼 수 있어요."
            />
          ) : (
            <FlatList
              ref={listRef}
              testID="chat-stream"
              className="flex-1"
              data={[...props.messages].reverse()}
              inverted
              // 입력 중 스트림 탭이 키보드를 닫지 않게(전송 버튼 탭은 그대로 전달).
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => props.onScroll?.(e.nativeEvent.contentOffset.y)}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => {
                if (item.kind === 'system') {
                  return (
                    <View className="items-center px-[14px] py-[7px]">
                      <Text
                        testID="chat-system-message"
                        className={cn(
                          'rounded-full bg-bg-2 px-[10px] py-[5px] text-[14px] font-semibold text-ink-3',
                          o && 'bg-[rgba(255,255,255,0.16)] text-white',
                        )}
                      >
                        {item.body}
                      </Text>
                    </View>
                  );
                }

                const mine = item.userId === selfId;
                const member = members.find((mm) => mm.userId === item.userId);
                const isWhisper = item.whisperToUserId != null;
                const variant: 'them' | 'me' | 'whisper' = isWhisper ? 'whisper' : mine ? 'me' : 'them';

                // 이름 전달 규칙:
                //  - 받은 귓속말/them : 보낸이(member) 이름 → ChatBubble 이 이름+태그로 표시
                //  - 내가 보낸 귓속말   : '수신자' 이름(@닉네임) → 누구에게 속삭였는지
                //  - 내 일반 메시지(me) : 이름 미표시(ChatBubble 이 숨김)
                const name =
                  isWhisper && mine
                    ? (members.find((mm) => mm.userId === item.whisperToUserId)?.name ?? '상대')
                    : member?.name;

                return (
                  <View className="px-[14px] py-[5px]">
                    <ChatBubble
                      variant={variant}
                      mine={mine}
                      name={name}
                      avatarInitial={member?.avatarInitial}
                      avatarBg={member?.avatarBg}
                      avatarPhotoUrl={member?.photoUrl}
                      onAvatarPress={() => props.onAvatarPress(item.userId)}
                      sendState={mine ? item.sendState : 'sent'}
                      timeLabel={formatChatTime(item.createdAt)}
                      onRetry={() => {
                        if (item.clientMsgId) props.onRetry(item.clientMsgId);
                      }}
                    >
                      {/* G-B: 본문 @토큰을 mention 노드로 강조(them/me/whisper·낙관 공통). */}
                      {renderBodyWithMentions(item.body, { variant })}
                    </ChatBubble>
                  </View>
                );
              }}
            />
          )}

          {/* 컴포저 영역 — 입력창↔키보드 간격 축소: 하단 SafeArea(홈 인디케이터)
              인셋(~34px) 대신 작은 고정 패딩(pb-2=8px). 키보드가 뜨면 컴포저가
              키보드에 가깝게 붙는다(참고 디자인). 오버레이면 dark band(.62). */}
          <View className={cn('pb-2', o ? bandClass : undefined)}>
            <NewMessageJumpButton count={props.newCount} onPress={handleJump} />
            <MentionAutocomplete
              candidates={candidates}
              visible={candidates.length > 0}
              onSelect={(c) => {
                const member = members.find((m) => m.userId === c.userId);
                if (member) props.onSelectMention(member);
              }}
            />
            <InputBar
              onDark={o}
              value={input}
              onChange={props.onChangeInput}
              onSend={props.onSend}
              sendDisabled={!sendable}
              charcount={{ count: messageLength(input), max: MAX_BODY }}
              whisperTarget={
                whisperTarget
                  ? {
                      name: whisperTarget.name,
                      avatarInitial: whisperTarget.avatarInitial,
                      avatarBg: whisperTarget.avatarBg,
                    }
                  : null
              }
              onClearWhisper={props.onClearWhisper}
            />
          </View>
        </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

RoomChatView.displayName = 'RoomChatView';

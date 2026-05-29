import { useCallback, useMemo, useRef } from 'react';
import { FlatList, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  ChatBubble,
  InputBar,
  MentionAutocomplete,
  NewMessageJumpButton,
  StateView,
  TopNav,
  type MentionCandidate,
} from '@dei/ui';
import type { ChatMessage } from '@/lib/chat/message-merge';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { filterCandidates, parseMentionQuery } from '@/lib/chat/mention';
import { isSendable, MAX_BODY, messageLength } from '@/lib/chat/length';

/**
 * RoomChatView — S13a 방 내부 단체채팅 + @귓속말의 순수 view.
 *
 * 데이터(메시지·멤버·입력·귓속말 대상)와 핸들러를 전부 props 로 받는다.
 * supabase/router/realtime 배선은 route 파일(chat.tsx)이 담당 →
 * 이 컴포넌트는 supabase mock 없이 RNTL 로 직접 렌더·검증 가능하다.
 *
 * raw 스타일 0(@dei/ui + NativeWind 토큰만). 멘션 후보 필터/길이 게이트는
 * lib/chat 순수로직(parseMentionQuery·filterCandidates·isSendable)을 재사용.
 */
export interface RoomChatViewProps {
  roomName: string;
  memberCount: number;
  selfId: string;
  messages: ChatMessage[];
  members: RoomMemberLite[];
  input: string;
  whisperTarget: { userId: string; name: string; avatarInitial?: string; avatarBg?: string } | null;
  onChangeInput: (t: string) => void;
  onSend: () => void;
  onRetry: (clientMsgId: string) => void;
  onSelectMention: (c: RoomMemberLite) => void;
  onClearWhisper: () => void;
  onAvatarPress: (userId: string) => void;
  onClose: () => void;
  newCount: number;
  onJump: () => void;
  /** 스트림 스크롤 위치 변화(inverted: offsetY≈0 이 하단). route 가 nearBottom 판정에 사용. */
  onScroll?: (offsetY: number) => void;
  visible: boolean;
  blockedIds?: Set<string>;
  roomEnded?: boolean;
}

export function RoomChatView(props: RoomChatViewProps) {
  const { input, members, selfId, blockedIds, whisperTarget } = props;
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // 점프: inverted 스트림에서 하단(offset 0)으로 이동 후 route 의 newCount 리셋 위임.
  const handleJump = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    props.onJump();
  }, [props]);

  // 멘션 후보: @쿼리가 활성이고 귓속말 대상이 아직 없을 때만 노출. self/blocked/left 제외.
  const candidates: MentionCandidate[] = useMemo(() => {
    const mention = parseMentionQuery(input);
    if (!mention.active || whisperTarget != null) return [];
    return filterCandidates(members, mention.query, {
      selfId,
      blockedIds: blockedIds ?? new Set<string>(),
    }).map((m) => ({
      userId: m.userId,
      name: m.name,
      avatarInitial: m.avatarInitial,
      avatarBg: m.avatarBg,
    }));
  }, [input, members, selfId, blockedIds, whisperTarget]);

  const sendable = isSendable(input) && !props.roomEnded;

  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} heightPct={78}>
      <TopNav
        left="close"
        title={props.roomName}
        onLeftPress={props.onClose}
        rightActions={<Badge variant="count">{`${props.memberCount}명`}</Badge>}
      />

      {props.messages.length === 0 ? (
        <StateView kind="empty" icon="💬" title="아직 메시지가 없어요" />
      ) : (
        <FlatList
          ref={listRef}
          testID="chat-stream"
          className="flex-1"
          data={[...props.messages].reverse()}
          inverted
          scrollEventThrottle={16}
          onScroll={(e) => props.onScroll?.(e.nativeEvent.contentOffset.y)}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const mine = item.userId === selfId;
            const member = members.find((mm) => mm.userId === item.userId);
            const variant = item.whisperToUserId != null ? 'whisper' : mine ? 'me' : 'them';
            return (
              <View className="px-[14px] py-[3px]">
                <ChatBubble
                  variant={variant}
                  name={member?.name}
                  avatarInitial={member?.avatarInitial}
                  avatarBg={member?.avatarBg}
                  sendState={mine ? item.sendState : 'sent'}
                  onRetry={() => {
                    if (item.clientMsgId) props.onRetry(item.clientMsgId);
                  }}
                >
                  {item.body}
                </ChatBubble>
              </View>
            );
          }}
        />
      )}

      <View>
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
    </BottomSheet>
  );
}

RoomChatView.displayName = 'RoomChatView';

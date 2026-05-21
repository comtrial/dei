/**
 * CH2 · 채팅방 1:1.
 *   - 메시지 스트림 (Realtime 구독, useChatRoom)
 *   - AppBar 좌측 상대 닉네임/아바타 → OP3 (상대 공개 프로필) — 10-G alt
 *   - AppBar 우상단 더보기 → CH4 시트
 *   - CH4 "상대 프로필 보기" → OP3 — 10-G
 *   - 하단 컴포저 (1~500자, 카운터, 전송 = Edge/RPC, 실패 인라인 retry — 10-E)
 *   - CH5 나가기 확정 → leave → 완료 토스트 "대화에서 나갔습니다" → H2 (10-F)
 *   - 상대 나감/종료 수신 시 무음 정리 후 H2 자동 복귀 (B-CH6 / 10-H)
 *
 * OP3(매칭 후 상대 공개 프로필) 은 공개 프로필 라우트 `/profiles/[userId]` 로
 * 구현돼 있고 `enterOpponentProfile` seam 이 그쪽으로 navigate 한다.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MoreVertical } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatMoreSheet } from '@/components/chat/ChatMoreSheet';
import { LeaveChatDialog } from '@/components/chat/LeaveChatDialog';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useChatRoom } from '@/hooks/useChatRoom';
import { fetchOtherProfile, leaveConversation } from '@/lib/chat/chat-service';
import { enterOpponentProfile } from '@/lib/chat/opponent-profile';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export default function ChatRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    conversationId?: string;
    otherUserId?: string;
    otherNickname?: string;
  }>();
  const conversationId = params.conversationId ?? null;
  const myId = user?.id ?? null;

  // 상대 프로필(닉네임/사진)을 otherUserId 로 조회. 조회 전엔 param 닉네임 fallback.
  const [otherProfile, setOtherProfile] = useState<{
    nickname: string;
    photoUrl: string | null;
  } | null>(null);
  useEffect(() => {
    const oid = params.otherUserId;
    if (!oid) return;
    let active = true;
    void logger.withErrorCapture('chat.header.profile', async () => {
      const p = await fetchOtherProfile(oid);
      if (active && p) setOtherProfile(p);
    });
    return () => {
      active = false;
    };
  }, [params.otherUserId]);

  const nickname = otherProfile?.nickname || params.otherNickname || '상대';
  const photoUrl = otherProfile?.photoUrl ?? null;

  const { messages, loading, ended, sendFailure, clearSendFailure, send, retry } =
    useChatRoom(conversationId, myId);
  const [moreOpen, setMoreOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // 상대 나감/종료 수신 → 무음 정리 후 자동 복귀 (B-CH6 / 10-H).
  // FULL-spec B-CH6 (POSTCONDITION on chat_list_item_tapped): "CH2 활성
  // 중이면 250ms 페이드아웃 → H2 자동 복귀. 토스트/배너/푸시 0건."
  // 목적지는 CH1(목록) 가 아니라 H2(home) — 스펙 정합(이전 messages 복귀 버그
  // 수정). CH1 목록에서의 제거는 messages 화면의 focus reload 가 담당.
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => {
      router.replace(ROUTES.home);
    }, 250);
    return () => clearTimeout(t);
  }, [ended, router]);

  // 10-E: message_send_failed → DISPLAY_MESSAGE_TO_USER. 코드베이스 기존
  // 패턴(Alert.alert)으로 네이티브 토스트를 띄우고, 동시에 화면 내 배너
  // (testID=chat-send-error)로도 노출해 자동 검증(e2e-web)이 가능하게 한다.
  // 비재시도 실패는 retry 마커 없이 이 토스트로만 안내된다 (P0-3 / P0-4).
  useEffect(() => {
    if (!sendFailure) return;
    Alert.alert('', sendFailure.message);
  }, [sendFailure]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
  }, [messages.length, scrollToEnd]);

  // 10-G: CH4 "상대 프로필 보기" → OP3 (cross-WF). enterOpponentProfile seam
  // 이 OP3 라우트 존재 시 navigate, 없으면 funnel 비차단 안전 degrade.
  const handleViewProfile = useCallback(() => {
    setMoreOpen(false);
    logger.addBreadcrumb({
      message: 'chat_view_profile_tapped',
      category: 'chat',
      data: { otherUserId: params.otherUserId },
    });
    const r = enterOpponentProfile((t) => router.push(t as never), {
      otherUserId: params.otherUserId ?? null,
      conversationId,
      source: 'ch4-sheet',
    });
    if (!r.routed && r.degradeMessage) {
      Alert.alert('', r.degradeMessage);
    }
  }, [params.otherUserId, conversationId, router]);

  // 10-G alt: CH2 AppBar 상대 아바타/닉네임 tap → OP3 직진입.
  const handleHeaderProfile = useCallback(() => {
    logger.addBreadcrumb({ message: 'chat_header_avatar_tapped', category: 'chat' });
    const r = enterOpponentProfile((t) => router.push(t as never), {
      otherUserId: params.otherUserId ?? null,
      conversationId,
      source: 'ch2-header',
    });
    if (!r.routed && r.degradeMessage) {
      Alert.alert('', r.degradeMessage);
    }
  }, [params.otherUserId, conversationId, router]);

  // 10-F: CH5 "나가기" 확정 → CH-API2(leave) → 양쪽 DELETED + soft-delete +
  // UNMATCHED + 상대에게 conversation.ended(LEFT_BY_OTHER) push. 성공 시
  // FULL-spec payload 의 정확 토스트 "대화에서 나갔습니다" → navigate H2.
  // (이전: 토스트 없음 + messages 복귀 — 스펙 payload 와 불일치하던 것 수정.)
  const handleLeaveConfirm = useCallback(() => {
    if (!conversationId) return;
    setLeaving(true);
    void logger
      .withErrorCapture(
        'chat.leave',
        async () => {
          await leaveConversation(conversationId);
        },
        { tags: { feature: 'chat-room' }, extra: { conversationId } },
      )
      .then(() => {
        setLeaveOpen(false);
        Alert.alert('', '대화에서 나갔습니다');
        router.replace(ROUTES.home);
      })
      .catch(() => {
        Alert.alert('', '나가기에 실패했어요. 다시 시도해 주세요.');
      })
      .finally(() => setLeaving(false));
  }, [conversationId, router]);

  return (
    <SafeAreaView className="bg-background flex-1" testID="chat-room">
      {/* AppBar */}
      <View className="border-border flex-row items-center justify-between border-b px-3 py-3">
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="뒤로"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
            onPress={() => {
              logger.addBreadcrumb({ message: 'chat_back_tapped', category: 'chat' });
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace(ROUTES.messages);
              }
            }}
            testID="chat-header-back">
            <Icon as={ChevronLeft} className="text-foreground" size={24} />
          </Pressable>
          <Pressable
            accessibilityLabel={`${nickname} 프로필 보기`}
            accessibilityRole="button"
            className="flex-row items-center gap-2 active:opacity-70"
            onPress={handleHeaderProfile}
            testID="chat-header-profile">
          {photoUrl ? (
            <Image
              accessibilityLabel={`${nickname} 프로필 사진`}
              className="bg-secondary h-9 w-9 rounded-full"
              source={{ uri: photoUrl }}
            />
          ) : (
            <View className="bg-secondary h-9 w-9 items-center justify-center rounded-full">
              <Text className="text-secondary-foreground font-semibold">
                {nickname.charAt(0) || '?'}
              </Text>
            </View>
          )}
          <Text className="text-base font-semibold">{nickname}</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="더보기"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
          onPress={() => {
            logger.addBreadcrumb({ message: 'chat_more_tapped', category: 'chat' });
            setMoreOpen(true);
          }}
          testID="chat-header-more">
          <Icon as={MoreVertical} className="text-foreground" size={22} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center" testID="chat-room-loading">
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4"
            contentContainerClassName="py-4"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            testID="chat-message-list">
            {messages.length === 0 ? (
              <View className="mt-10 items-center">
                <Text className="text-muted-foreground text-sm">
                  첫 메시지를 보내 대화를 시작해 보세요.
                </Text>
              </View>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.clientId ?? m.id}
                  isMine={m.senderUserId === myId}
                  message={m}
                  onRetry={retry}
                />
              ))
            )}
          </ScrollView>
        )}

        {sendFailure ? (
          <Pressable
            accessibilityLabel="전송 실패 안내 닫기"
            accessibilityRole="button"
            className="border-destructive/30 bg-destructive/10 mx-4 mb-1 flex-row items-center justify-between rounded-md border px-3 py-2"
            onPress={clearSendFailure}
            testID="chat-send-error">
            <Text className="text-destructive flex-1 text-sm">
              {sendFailure.message}
            </Text>
            <Text className="text-destructive ml-2 text-xs">닫기</Text>
          </Pressable>
        ) : null}

        <ChatComposer disabled={ended} onSend={send} />
      </KeyboardAvoidingView>

      <ChatMoreSheet
        onClose={() => setMoreOpen(false)}
        onLeave={() => {
          logger.addBreadcrumb({ message: 'chat_leave_menu_tapped', category: 'chat' });
          setMoreOpen(false);
          setLeaveOpen(true);
        }}
        onViewProfile={handleViewProfile}
        visible={moreOpen}
      />

      <LeaveChatDialog
        onCancel={() => {
          logger.addBreadcrumb({ message: 'chat_leave_cancelled', category: 'chat' });
          setLeaveOpen(false);
        }}
        onConfirm={() => {
          logger.addBreadcrumb({ message: 'chat_leave_confirmed', category: 'chat' });
          handleLeaveConfirm();
        }}
        open={leaveOpen}
        pending={leaving}
      />
    </SafeAreaView>
  );
}

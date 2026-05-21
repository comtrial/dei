/**
 * CH0 · 채팅 진입 라우터 + 차단/상태 게이트.
 *
 * FULL-spec CH0 purpose: "LK8 / OP3 / H2 탭바 / 푸시 알림 4개 진입점에서
 * conversation_id 를 해석 + blocks 양방향 조회 + conversations.status 판정 후
 * CH2/토스트/CH1 분기. 모든 채팅 진입의 단일 게이트." (B-CH1)
 *
 * 4개 진입점 (LK8=10-A / OP3=10-C / H2 탭바=CH1=10-B / 푸시 deeplink=10-D)
 * 에서 conversationId 를 params(+source) 로 받아:
 *   1) conversations row + 양방향 차단 조회 (loadConversationGate)
 *   2) resolveChatRoute 로 분기 판정 (FULL-spec chat_route_resolved payload)
 *   3) ENTERED → CH2(chat-room) replace
 *      BLOCKED  → "더 이상 대화할 수 없습니다" → H2(home) replace
 *      ENDED    → "종료된 대화입니다"        → CH1(messages) replace
 *      NOT_FOUND→ CH1(messages)
 *
 * 10-D: 푸시 deeplink 에 conversationId 가 실리면 source='push' 로 이 게이트를
 * 그대로 통과 — 만료/차단 시 BLOCKED/ENDED 가 라우터에서 흡수된다. 단,
 * conversationId 없는 일반 채팅 알림의 conversation_count(>0→CH1 /=0→CH3)
 * 분기와 실제 OS 푸시 토큰 등록/탭 핸들러는 푸시 인프라(미구현, stub:
 * hooks/useNotifications.ts) 소관 — lib/chat/push-deeplink.ts 의 순수
 * 라우팅 결정 로직만 채팅 모듈이 책임진다.
 *
 * 이 화면 자체는 UI 가 없는 게이트 (스피너만). DEV-SPEC CH0.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { loadConversationGate } from '@/lib/chat/chat-service';
import { resolveChatRoute } from '@/lib/chat/route-gate';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export default function ChatRouteGate() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ conversationId?: string; source?: string }>();
  const conversationId = params.conversationId ?? null;

  // 이 게이트 화면은 탭 네비게이터 화면(href:null)이라 인스턴스가 유지된다.
  // useEffect + 모듈수명 ref 로 "한 번만" 막으면 재진입 시 라우팅이 안 돼
  // 스피너 무한 로딩이 된다 → focus 마다 재평가하고, 동일 focus 내 중복만
  // focus-scoped 플래그로 막는다.
  useFocusEffect(
    useCallback(() => {
    let resolved = false;
    const myId = user?.id ?? null;

    // 인증/식별 불가 → 목록으로.
    if (!myId) {
      return;
    }

    logger.addBreadcrumb({
      message: 'chat_route_evaluating',
      category: 'chat',
      data: { conversationId, source: params.source ?? 'unknown' },
    });

    const backToList = () => router.replace(ROUTES.messages);

    void logger.withErrorCapture(
      'chat.route.resolve',
      async () => {
        let gate: Awaited<ReturnType<typeof loadConversationGate>> = {
          conversation: null,
          isBlocked: false,
        };
        if (conversationId) {
          gate = await loadConversationGate(conversationId, myId);
        }
        // 이미 blur 됐으면(빠른 뒤로가기 등) 라우팅하지 않는다.
        if (resolved) return;

        const resolution = resolveChatRoute({
          conversationId,
          conversation: gate.conversation
            ? { status: gate.conversation.status }
            : null,
          isBlocked: gate.isBlocked,
        });

        logger.addBreadcrumb({
          message: 'chat_route_resolved',
          category: 'chat',
          data: { outcome: resolution.outcome },
        });

        switch (resolution.outcome) {
          case 'ENTERED':
            router.replace({
              pathname: ROUTES.chatRoom,
              params: {
                conversationId: resolution.conversationId ?? '',
                otherUserId: gate.conversation?.otherUserId ?? '',
              },
            });
            return;
          // FULL-spec chat_route_resolved:
          //   outcome=BLOCKED → DISPLAY_MESSAGE_TO_USER then "navigate H2"
          //   outcome=ENDED   → DISPLAY_MESSAGE_TO_USER then "navigate CH1"
          // H2 = home(ROUTES.home), CH1 = 목록(ROUTES.messages). 두 분기를
          // 같은 목적지로 보내던 버그 수정 (PM 검증서 P0-2).
          case 'BLOCKED':
            if (resolution.toast) {
              Alert.alert('', resolution.toast);
            }
            router.replace(ROUTES.home);
            return;
          case 'ENDED':
            if (resolution.toast) {
              Alert.alert('', resolution.toast);
            }
            router.replace(ROUTES.messages);
            return;
          case 'NOT_FOUND':
          default:
            backToList();
        }
      },
      { tags: { feature: 'chat-route' }, extra: { conversationId } },
    ).catch(() => {
      // 게이트 실패 시 안전하게 목록 복귀 (무음 정리 원칙).
      router.replace(ROUTES.messages);
    });

    return () => {
      resolved = true;
    };
    }, [conversationId, params.source, router, user?.id]),
  );

  return (
    <View className="bg-background flex-1 items-center justify-center" testID="chat-route-gate">
      <ActivityIndicator />
    </View>
  );
}

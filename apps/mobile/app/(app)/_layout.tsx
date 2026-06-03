import { Stack } from 'expo-router';

import { resolveChatPresentationMode } from '@/lib/chat/presentation';

/**
 * (app) 그룹 — 로그인 메인 흐름.
 * ------------------------------------------------------------------
 * 계획서엔 "탭" 으로 적혀 있었으나, HTML SSOT(all-screens) 의 실제 동선은
 * splash → home(S05) → queue(S07) → room(S13) → settings 허브(S19) 로
 * 이어지는 **스택 내비게이션**이며 화면을 가로지르는 영구 하단 탭바가 없다
 * (홈은 상단바 + 우상단 아바타로 프로필 진입). 따라서 SSOT 충실(D-03)을 위해
 * 탭이 아닌 Stack 으로 둔다. 헤더는 각 화면이 @dei/ui TopNav 로 직접 그린다.
 *
 * 딥링크: `dei://room/[roomId]` (room/[roomId] 동적 라우트로 흡수).
 */
export default function AppLayout() {
  // 채팅 진입 방식(피처 플래그, 앱 재배포 없이 원격 분기 — PostHog `chat-overlay-mode`).
  //  - overlay : 매칭된 방(room/index, 영상) 위 반투명 오버레이(transparentModal+fade).
  //              직전 화면(영상)이 마운트된 채 뒤에 비침. UX 스펙대로 scrim 은 화면이 그림.
  //  - legacy  : 기존 — 별도 화면(card)으로 push(불투명).
  // 영상 코드(room/index·video 훅)는 어느 모드에서도 건드리지 않는다.
  const overlay = resolveChatPresentationMode() === 'overlay';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="room/[roomId]/chat"
        options={
          overlay
            ? { presentation: 'transparentModal', animation: 'fade' }
            : { presentation: 'card' }
        }
      />
      {/*
       * 방 나가기 확인 — 내부에서 BottomSheet(RN Modal, 아래서 슬라이드업)를 직접
       * 그리는 화면. 기본 card presentation 이면 (a) 화면이 옆에서 슬라이드 +
       * (b) 내부 BottomSheet 가 아래서 슬라이드 = 이중 애니메이션이고, iOS card 의
       * swipe-to-dismiss 제스처 때문에 시트가 위아래로 끌려다닌다. 그래서:
       *  - transparentModal: 뒤 방 화면이 비친 채 BottomSheet 만 아래서 등장(단일 애니).
       *  - animation:'fade': 화면 자체의 옆 슬라이드 제거(등장은 BottomSheet 가 담당).
       *  - gestureEnabled:false: 스와이프-디스미스 차단 → 시트 위치 고정(드래그 잠금).
       */}
      <Stack.Screen
        name="room/[roomId]/leave-confirm"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

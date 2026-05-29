import { Stack } from 'expo-router';

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
  return <Stack screenOptions={{ headerShown: false }} />;
}

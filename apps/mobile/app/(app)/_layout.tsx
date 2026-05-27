import { Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/navigation/bottom-tab-bar';
import { usePushTokenRegistration } from '@/hooks/usePushTokenRegistration';
import { useAuth } from '@/providers/auth-provider';

/**
 * (app) 그룹 layout — Phase 1 정리 후 옛 도메인 탭(chat/messages/matches/likes/...)
 * 을 전부 제거. 새 도메인(방/묶음/부스터) 탭은 Phase 3 에서 추가.
 *
 * 현재 살아있는 라우트:
 *   - home              (탭, 매칭 허브)
 *   - record            (탭, 일상 영상 녹화)
 *   - settings          (숨김, 설정에서 진입)
 *   - my-profile        (숨김, 프로필 화면에서 진입)
 *   - profiles/[id]     (숨김, 다른 멤버 프로필 보기)
 *   - solo-join         (숨김, 혼자 참여 확인)    — Phase 3C-2
 *   - group/new         (숨김, 묶음 생성)          — Phase 3C-2
 *   - group/[groupId]   (숨김, 묶음 상태/매칭 시작) — Phase 3C-2
 */
export default function AppLayout() {
  const { user } = useAuth();

  usePushTokenRegistration(user?.id);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="record" options={{ title: 'My dei' }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="my-profile" options={{ href: null }} />
      <Tabs.Screen name="profiles/[userId]" options={{ href: null }} />
      {/* Phase 3C-2 — 묶음/솔로 진입 화면 */}
      <Tabs.Screen name="solo-join" options={{ href: null }} />
      <Tabs.Screen name="group/new" options={{ href: null }} />
      <Tabs.Screen name="group/[groupId]" options={{ href: null }} />
    </Tabs>
  );
}

import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { routeGroupOf } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/**
 * RootGate — 세션 가드 (spec §3.3)
 * ------------------------------------------------------------------
 * 5분기 라우팅 결정 자체는 splash(`app/index.tsx`, S01)가 한다. 여기서는
 * "세션이 없는데 보호 그룹((app)/(onboarding))에 들어와 있으면 splash 로
 * 되돌려 재라우팅시킨다" 만 책임진다(딥링크/세션 만료로 보호 화면에 직접
 * 진입하는 경우 방어).
 *
 * 세부 게이트(프로필 완성·매칭 상태에 따른 분기)는 splash 부트스트랩 조회로
 * 결정되며, B 가 화면을 채우며 확장한다.
 */
export function RootGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, user } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const group = routeGroupOf(pathname);
    const inProtected = group === 'app' || group === 'onboarding';

    if (!user && inProtected) {
      // 세션 없이 보호 화면 → splash 로 되돌려 재라우팅.
      router.replace('/');
    }
  }, [isLoading, user, pathname, router]);

  return children;
}

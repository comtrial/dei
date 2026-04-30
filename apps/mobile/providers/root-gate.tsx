import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { isAppRoute, isAuthRoute, isOnboardingRoute, routeForEligibility, ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export function RootGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading: isAuthLoading, user } = useAuth();
  const { eligibility, isLoading: isGateLoading } = useAccountGate();

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      if (!isAuthRoute(pathname)) {
        router.replace(ROUTES.welcome as never);
      }
      return;
    }

    if (isGateLoading || !eligibility) {
      return;
    }

    const targetRoute = routeForEligibility(eligibility);

    if (targetRoute === ROUTES.accountStatus && pathname !== ROUTES.accountStatus) {
      router.replace(targetRoute as never);
      return;
    }

    if (isAuthRoute(pathname)) {
      return;
    }

    if (isOnboardingRoute(pathname) && eligibility.account_state === 'active') {
      if (pathname === ROUTES.profile && eligibility.identity_verified && eligibility.age_eligible) {
        return;
      }

      if (pathname === ROUTES.firstVideo && eligibility.profile_complete) {
        return;
      }

      if (pathname === ROUTES.videoReview && eligibility.first_video_uploaded) {
        return;
      }
    }

    if (targetRoute === ROUTES.discovery && isAppRoute(pathname)) {
      return;
    }

    if (pathname !== targetRoute) {
      router.replace(targetRoute as never);
    }
  }, [eligibility, isAuthLoading, isGateLoading, pathname, router, user]);

  return children;
}

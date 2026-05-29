import { Stack } from 'expo-router';

/**
 * (onboarding) 그룹 — 가입 멀티스텝 (S04 1/3 → S04b 2/3 → S04c 3/3).
 * 담당: B. 진행바·뒤로가기는 각 step 화면이 @dei/ui(ProgressBar/TopNav)로 그린다.
 */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

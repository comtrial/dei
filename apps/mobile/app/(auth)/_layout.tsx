import { Stack } from 'expo-router';

/**
 * (auth) 그룹 — 비로그인 진입 흐름 (S02 약관 / S03 본인인증).
 * 담당: B. 헤더는 각 화면이 @dei/ui TopNav 로 직접 그린다.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

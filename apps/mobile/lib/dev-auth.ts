export const LOCAL_DEV_EMAIL = 'dev@dei.local';
export const LOCAL_DEV_OTP = '123456';
export const LOCAL_DEV_PASSWORD = 'dei-local-dev-password';

export function isLocalDevAuthEnabled() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  // 로컬 Supabase는 항상 54321 포트 사용 (LAN IP 접속 포함)
  return supabaseUrl.includes(':54321');
}

export function canUseLocalDevOtp(email: string) {
  return isLocalDevAuthEnabled() && email.trim().toLowerCase() === LOCAL_DEV_EMAIL;
}

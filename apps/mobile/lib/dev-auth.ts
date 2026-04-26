export const LOCAL_DEV_EMAIL = 'dev@dei.local';
export const LOCAL_DEV_OTP = '123456';
export const LOCAL_DEV_PASSWORD = 'dei-local-dev-password';

export function isLocalDevAuthEnabled() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  return (
    supabaseUrl.startsWith('http://127.0.0.1:54321') ||
    supabaseUrl.startsWith('http://localhost:54321') ||
    supabaseUrl.startsWith('http://10.0.2.2:54321')
  );
}

export function canUseLocalDevOtp(email: string) {
  return isLocalDevAuthEnabled() && email.trim().toLowerCase() === LOCAL_DEV_EMAIL;
}

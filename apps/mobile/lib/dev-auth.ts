export function isLocalDevAuthEnabled() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const isExplicitlyEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS === 'true';

  return isExplicitlyEnabled || supabaseUrl.includes(':54321');
}

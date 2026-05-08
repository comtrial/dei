export function isLocalDevAuthEnabled() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const isExplicitlyEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS === 'true';

  return isExplicitlyEnabled || supabaseUrl.includes(':54321');
}

export function isLocalDevPaymentEnabled() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const isExplicitlyEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_PAYMENT_BYPASS === 'true';
  const isIdentityBypassEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS === 'true';

  return isExplicitlyEnabled || isIdentityBypassEnabled || supabaseUrl.includes(':54321');
}

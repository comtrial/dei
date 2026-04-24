import { createSupabaseClient } from '@dei/api';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Check apps/mobile/.env',
  );
}

export const supabase = createSupabaseClient(url, anonKey);

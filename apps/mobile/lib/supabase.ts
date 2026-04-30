import { createSupabaseClient } from '@dei/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

type SupabaseStorage = NonNullable<Parameters<typeof createSupabaseClient>[2]>;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase env vars. Check apps/mobile/.env');
}

const localAndroidUrl = url
  .replace('://127.0.0.1', '://10.0.2.2')
  .replace('://localhost', '://10.0.2.2');

const ssrStorage = (() => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies SupabaseStorage;
})();

const storage = Platform.OS === 'web' && typeof window === 'undefined' ? ssrStorage : AsyncStorage;

export const supabase = createSupabaseClient(
  Platform.OS === 'android' ? localAndroidUrl : url,
  anonKey,
  storage,
);

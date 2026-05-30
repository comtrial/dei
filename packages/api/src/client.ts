import 'react-native-url-polyfill/auto';
import {
  createClient,
  SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;
type ClientOptions = SupabaseClientOptions<'public'>;
type RealtimeTransport = NonNullable<ClientOptions['realtime']>['transport'];

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
};

class MissingRealtimeTransport {
  constructor() {
    throw new Error('Realtime WebSocket transport is unavailable in this runtime.');
  }
}

const getRealtimeTransport = (): RealtimeTransport =>
  (typeof WebSocket === 'undefined'
    ? MissingRealtimeTransport
    : WebSocket) as unknown as RealtimeTransport;

export const createSupabaseClient = (
  url: string,
  anonKey: string,
  storage?: SupabaseStorage,
): TypedSupabaseClient =>
  createClient<Database, 'public'>(url, anonKey, {
    auth: {
      ...(storage ? { storage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    realtime: {
      transport: getRealtimeTransport(),
    },
  });

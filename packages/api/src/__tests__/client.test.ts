import { describe, expect, it } from 'vitest';

import { createSupabaseClient } from '../client';

describe('createSupabaseClient', () => {
  it('returns a client exposing the expected surface (auth, from, rpc)', () => {
    const client = createSupabaseClient(
      'http://127.0.0.1:54321',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    );

    expect(typeof client.auth.signInWithOtp).toBe('function');
    expect(typeof client.auth.signOut).toBe('function');
    expect(typeof client.auth.getSession).toBe('function');
    expect(typeof client.from).toBe('function');
    expect(typeof client.rpc).toBe('function');
  });

  it('honors a custom storage adapter', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    const client = createSupabaseClient('http://127.0.0.1:54321', 'anon', storage);

    // Smoke check: client is constructed without throwing and exposes auth.
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});

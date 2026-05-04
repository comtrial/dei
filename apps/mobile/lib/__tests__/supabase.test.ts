import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('supabase client module', () => {
  it('throws when env vars are missing', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    await expect(import('../supabase')).rejects.toThrow(/Missing Supabase env vars/);
  });

  it('exposes a typed client when env vars are set', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const mod = await import('../supabase');

    expect(mod.supabase).toBeDefined();
    expect(typeof mod.supabase.auth.getSession).toBe('function');
    expect(typeof mod.supabase.from).toBe('function');
  });
});

describe('supabase client module (Android)', () => {
  beforeEach(() => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
  });

  it('rewrites 127.0.0.1 / localhost to 10.0.2.2 for the emulator', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const { supabase } = await import('../supabase');
    // The constructed client wraps the URL on internal `url` property; assert
    // via REST URL builder which embeds the configured base.
    const url = (supabase as unknown as { rest: { url: string } }).rest.url;
    expect(url).toContain('10.0.2.2');
    expect(url).not.toContain('127.0.0.1');
  });
});

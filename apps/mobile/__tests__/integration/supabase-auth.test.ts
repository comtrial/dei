/**
 * Supabase auth integration test.
 *
 * Requires `pnpm db:start` to be running. Auto-skips otherwise so this file is
 * safe to keep in the default test run.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { isSupabaseReachable, makeAnonClient } from './setup';

let reachable = false;

beforeAll(async () => {
  reachable = await isSupabaseReachable();
});

describe.skipIf(!process.env.RUN_INTEGRATION && !reachable)('supabase auth (local)', () => {
  it('responds to getSession with no active session for a fresh anon client', async () => {
    const client = makeAnonClient();
    const { data, error } = await client.auth.getSession();

    expect(error).toBeNull();
    expect(data.session).toBeNull();
  });

  it('rejects an obviously bad OTP verification with a clear error', async () => {
    const client = makeAnonClient();
    const { data, error } = await client.auth.verifyOtp({
      email: 'nobody@example.test',
      token: '000000',
      type: 'email',
    });

    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });
});

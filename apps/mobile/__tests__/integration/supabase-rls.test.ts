/**
 * RLS integration test scaffold. Replace `_protected_table_placeholder` with a
 * real protected table once one exists. The skip-if-unreachable guard mirrors
 * supabase-auth.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { isSupabaseReachable, makeAnonClient } from './setup';

let reachable = false;

beforeAll(async () => {
  reachable = await isSupabaseReachable();
});

describe.skipIf(!process.env.RUN_INTEGRATION && !reachable)('supabase RLS (local)', () => {
  it('anonymous client cannot read a protected table (placeholder)', async () => {
    const client = makeAnonClient();
    const { error } = await client.from('_protected_table_placeholder').select('*');

    // Expect either a 404 (table missing) or an RLS / permission error.
    // Both are acceptable for this scaffold; tighten once the table exists.
    expect(error).not.toBeNull();
  });
});

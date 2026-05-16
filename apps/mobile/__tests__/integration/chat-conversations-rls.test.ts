/**
 * Chat backend integration tests — conversations / messages.
 *
 * Covers:
 *   - conversation + message CRUD via send_message RPC (CH-API1 / B-CH2)
 *   - RLS: only participants can read conversations/messages
 *   - RLS: bidirectional block hides conversation/messages + blocks send (B-CH1/B-CH2)
 *   - leave_conversation RPC: DELETED + soft-delete + matches UNMATCHED (CH-API2 / B-CH5)
 *
 * Needs a local Supabase + service-role key (creates auth users). Skips
 * automatically when either is missing, so the regular test run stays light.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  hasServiceRoleKey,
  isSupabaseReachable,
  makeAnonClient,
  makeServiceClient,
} from './setup';

let reachable = false;
const hasKey = hasServiceRoleKey();
const enabled = Boolean(process.env.RUN_INTEGRATION) && hasKey;

const uniqueEmail = (p: string) =>
  `${p}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)}@example.test`;

beforeAll(async () => {
  if (!enabled) return;
  reachable = await isSupabaseReachable();
  if (!reachable) {
    throw new Error('Local Supabase is not reachable. Start it with `pnpm db:start`.');
  }
});

/** Creates a confirmed auth user and returns an anon client signed in as them. */
async function makeUserClient(prefix: string) {
  const service = makeServiceClient();
  const email = uniqueEmail(prefix);
  const password = `Pw-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = created.user?.id as string;
  expect(userId).toBeTruthy();

  const client = makeAnonClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  expect(signInErr).toBeNull();

  return { client, userId, email };
}

describe.skipIf(!enabled)('chat backend — conversations / messages (local)', () => {
  it('participants can send + read messages; conversation sort metadata updates', async () => {
    const service = makeServiceClient();
    const a = await makeUserClient('chat-a');
    const b = await makeUserClient('chat-b');

    try {
      // Matching pipeline → conversation (server-only RPC).
      const { data: convId, error: ensureErr } = await service.rpc(
        'ensure_conversation_for_match',
        { p_user_x: a.userId, p_user_y: b.userId },
      );
      expect(ensureErr).toBeNull();
      expect(convId).toBeTruthy();

      // A sends a message (CH-API1 path via send_message RPC).
      const { data: sent, error: sendErr } = await a.client.rpc('send_message', {
        p_conversation_id: convId,
        p_body: 'hello from A',
      });
      expect(sendErr).toBeNull();
      const sentRow = Array.isArray(sent) ? sent[0] : sent;
      expect(sentRow.body).toBe('hello from A');
      expect(sentRow.status).toBe('SENT');
      expect(sentRow.sender_user_id).toBe(a.userId);

      // B can read it (participant).
      const { data: bView, error: bErr } = await b.client
        .from('messages')
        .select('id, body, sender_user_id')
        .eq('conversation_id', convId);
      expect(bErr).toBeNull();
      expect(bView?.length).toBe(1);
      expect(bView?.[0].body).toBe('hello from A');

      // Conversation preview / last_message_at updated for CH1 sort.
      const { data: conv } = await a.client
        .from('conversations')
        .select('last_message_preview, last_message_at, status')
        .eq('id', convId)
        .single();
      expect(conv?.status).toBe('ACTIVE');
      expect(conv?.last_message_preview).toBe('hello from A');
      expect(conv?.last_message_at).toBeTruthy();
    } finally {
      await service.auth.admin.deleteUser(a.userId);
      await service.auth.admin.deleteUser(b.userId);
    }
  });

  it('rejects body outside 1..500 chars', async () => {
    const service = makeServiceClient();
    const a = await makeUserClient('chat-len-a');
    const b = await makeUserClient('chat-len-b');
    try {
      const { data: convId } = await service.rpc('ensure_conversation_for_match', {
        p_user_x: a.userId,
        p_user_y: b.userId,
      });

      const empty = await a.client.rpc('send_message', {
        p_conversation_id: convId,
        p_body: '',
      });
      expect(empty.error?.message).toMatch(/1\.\.500/);

      const tooLong = await a.client.rpc('send_message', {
        p_conversation_id: convId,
        p_body: 'x'.repeat(501),
      });
      expect(tooLong.error?.message).toMatch(/1\.\.500/);
    } finally {
      await service.auth.admin.deleteUser(a.userId);
      await service.auth.admin.deleteUser(b.userId);
    }
  });

  it('non-participant cannot read conversation or messages (RLS)', async () => {
    const service = makeServiceClient();
    const a = await makeUserClient('chat-p-a');
    const b = await makeUserClient('chat-p-b');
    const outsider = await makeUserClient('chat-out');
    try {
      const { data: convId } = await service.rpc('ensure_conversation_for_match', {
        p_user_x: a.userId,
        p_user_y: b.userId,
      });
      await a.client.rpc('send_message', { p_conversation_id: convId, p_body: 'secret' });

      const { data: outConv } = await outsider.client
        .from('conversations')
        .select('id')
        .eq('id', convId);
      expect(outConv?.length ?? 0).toBe(0);

      const { data: outMsgs } = await outsider.client
        .from('messages')
        .select('id')
        .eq('conversation_id', convId);
      expect(outMsgs?.length ?? 0).toBe(0);
    } finally {
      await service.auth.admin.deleteUser(a.userId);
      await service.auth.admin.deleteUser(b.userId);
      await service.auth.admin.deleteUser(outsider.userId);
    }
  });

  it('bidirectional block hides conversation/messages and blocks sending (B-CH1/B-CH2)', async () => {
    const service = makeServiceClient();
    const a = await makeUserClient('chat-blk-a');
    const b = await makeUserClient('chat-blk-b');
    try {
      const { data: convId } = await service.rpc('ensure_conversation_for_match', {
        p_user_x: a.userId,
        p_user_y: b.userId,
      });
      await a.client.rpc('send_message', { p_conversation_id: convId, p_body: 'pre-block' });

      // B blocks A (one direction). RLS must hide for BOTH.
      const { error: blockErr } = await b.client.from('blocks').insert({
        blocker_user_id: b.userId,
        blocked_user_id: a.userId,
      });
      expect(blockErr).toBeNull();

      // A (the blocked one) can no longer read the conversation.
      const { data: aConv } = await a.client
        .from('conversations')
        .select('id')
        .eq('id', convId);
      expect(aConv?.length ?? 0).toBe(0);

      // B (the blocker) also cannot read it (bidirectional).
      const { data: bConv } = await b.client
        .from('conversations')
        .select('id')
        .eq('id', convId);
      expect(bConv?.length ?? 0).toBe(0);

      // Messages hidden for both.
      const { data: aMsgs } = await a.client
        .from('messages')
        .select('id')
        .eq('conversation_id', convId);
      expect(aMsgs?.length ?? 0).toBe(0);

      // Sending is rejected by server-side re-check (B-CH2).
      const { error: sendErr } = await a.client.rpc('send_message', {
        p_conversation_id: convId,
        p_body: 'should fail',
      });
      expect(sendErr?.message).toMatch(/blocked/i);
    } finally {
      await service.auth.admin.deleteUser(a.userId);
      await service.auth.admin.deleteUser(b.userId);
    }
  });

  it('leave_conversation: DELETED + messages soft-deleted + match UNMATCHED, send blocked (CH-API2/B-CH5)', async () => {
    const service = makeServiceClient();
    const a = await makeUserClient('chat-lv-a');
    const b = await makeUserClient('chat-lv-b');
    try {
      const { data: convId } = await service.rpc('ensure_conversation_for_match', {
        p_user_x: a.userId,
        p_user_y: b.userId,
      });
      await a.client.rpc('send_message', { p_conversation_id: convId, p_body: 'bye soon' });

      const { data: leftRows, error: leaveErr } = await a.client.rpc('leave_conversation', {
        p_conversation_id: convId,
      });
      expect(leaveErr).toBeNull();
      const left = Array.isArray(leftRows) ? leftRows[0] : leftRows;
      expect(left.status).toBe('DELETED');
      expect(left.other_user_id).toBe(b.userId);

      // Verify with service client (RLS-bypass) the durable effects.
      const { data: conv } = await service
        .from('conversations')
        .select('status, match_id')
        .eq('id', convId)
        .single();
      expect(conv?.status).toBe('DELETED');

      const { data: msgs } = await service
        .from('messages')
        .select('deleted_at')
        .eq('conversation_id', convId);
      expect(msgs?.length).toBe(1);
      expect(msgs?.every((m) => m.deleted_at !== null)).toBe(true);

      const { data: match } = await service
        .from('matches')
        .select('status')
        .eq('id', conv?.match_id)
        .single();
      expect(match?.status).toBe('UNMATCHED');

      // Subsequent send must fail (conversation not ACTIVE).
      const { error: sendErr } = await b.client.rpc('send_message', {
        p_conversation_id: convId,
        p_body: 'still there?',
      });
      expect(sendErr?.message).toMatch(/not active/i);
    } finally {
      await service.auth.admin.deleteUser(a.userId);
      await service.auth.admin.deleteUser(b.userId);
    }
  });

  it('anonymous client cannot read conversations/messages at all', async () => {
    const anon = makeAnonClient();
    const c = await anon.from('conversations').select('id');
    const m = await anon.from('messages').select('id');
    // RLS denies anon (authenticated-only policies) → empty set or error.
    expect((c.data?.length ?? 0) === 0 || c.error !== null).toBe(true);
    expect((m.data?.length ?? 0) === 0 || m.error !== null).toBe(true);
  });
});

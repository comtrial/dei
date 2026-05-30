// apps/mobile/lib/chat/__tests__/send-message.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc } }));

import { sendRoomMessage } from '../send-message';

beforeEach(() => { invoke.mockReset(); rpc.mockReset(); });

describe('sendRoomMessage', () => {
  it('uses functions.invoke as primary path', async () => {
    invoke.mockResolvedValue({ data: { ok: true, deduped: false, message: { id: 's1' } }, error: null });
    const r = await sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: null, clientMsgId: 'c1' });
    expect(invoke).toHaveBeenCalledWith('send-message', expect.objectContaining({
      body: { room_id: 'r', body: 'hi', whisper_to_user_id: null, client_msg_id: 'c1' },
    }));
    expect(r.message.id).toBe('s1');
  });

  it('falls back to RPC when invoke throws fetch error', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'fetch' } });
    rpc.mockResolvedValue({ data: { id: 's2', room_id: 'r', user_id: 'me', body: 'hi', whisper_to_user_id: null, created_at: 't' }, error: null });
    const r = await sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: null, clientMsgId: 'c1' });
    expect(rpc).toHaveBeenCalledWith('send_room_message', expect.any(Object));
    expect(r.message.id).toBe('s2');
  });

  it('throws a typed error on 422 invalid_whisper_target', async () => {
    invoke.mockResolvedValue({ data: { error: 'invalid_whisper_target', reason: 'blocked' }, error: { message: 'invalid_whisper_target' } });
    await expect(
      sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: 'x', clientMsgId: 'c1' }),
    ).rejects.toMatchObject({ code: 'invalid_whisper_target' });
  });
});

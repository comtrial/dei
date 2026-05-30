// packages/api/src/__tests__/sendMessage.contract.test.ts
import { describe, expect, it } from 'vitest';
import {
  sendMessageRequestSchema,
  sendMessageResponseSchema,
} from '../schemas/sendMessage';

describe('sendMessage contract', () => {
  it('accepts a valid full-chat request', () => {
    const r = sendMessageRequestSchema.safeParse({
      room_id: '11111111-1111-1111-1111-111111111111',
      body: '안녕하세요',
      client_msg_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.success).toBe(true);
  });

  it('rejects body over 500 code points', () => {
    const r = sendMessageRequestSchema.safeParse({
      room_id: '11111111-1111-1111-1111-111111111111',
      body: 'x'.repeat(501),
      client_msg_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid 200 response shape', () => {
    const r = sendMessageResponseSchema.safeParse({
      ok: true,
      deduped: false,
      message: {
        id: '33333333-3333-3333-3333-333333333333',
        room_id: '11111111-1111-1111-1111-111111111111',
        user_id: '44444444-4444-4444-4444-444444444444',
        body: '안녕',
        whisper_to_user_id: null,
        created_at: '2026-05-30T00:00:00Z',
      },
    });
    expect(r.success).toBe(true);
  });
});

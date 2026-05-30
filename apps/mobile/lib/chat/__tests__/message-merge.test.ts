// apps/mobile/lib/chat/__tests__/message-merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeIncoming, type ChatMessage } from '../message-merge';

const base: ChatMessage = {
  id: 'srv-1', clientMsgId: 'c1', userId: 'me', body: 'hi',
  whisperToUserId: null, createdAt: '2026-05-30T00:00:00Z', sendState: 'sent',
};

describe('mergeIncoming', () => {
  it('reconciles optimistic bubble by clientMsgId (no dup)', () => {
    const optimistic: ChatMessage = { ...base, id: 'tmp-1', sendState: 'sending' };
    const echo: ChatMessage = { ...base, id: 'srv-1', sendState: 'sent' };
    const out = mergeIncoming([optimistic], echo);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('srv-1');
    expect(out[0].sendState).toBe('sent');
  });

  it('dedups by server id when clientMsgId absent', () => {
    const existing: ChatMessage = { ...base, clientMsgId: null };
    const dup: ChatMessage = { ...base, clientMsgId: null };
    expect(mergeIncoming([existing], dup)).toHaveLength(1);
  });

  it('appends a genuinely new message and sorts by createdAt then id', () => {
    const older: ChatMessage = { ...base, id: 'a', clientMsgId: null, createdAt: '2026-05-30T00:00:00Z' };
    const newer: ChatMessage = { ...base, id: 'b', clientMsgId: 'c2', createdAt: '2026-05-30T00:00:01Z' };
    const out = mergeIncoming([older], newer);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

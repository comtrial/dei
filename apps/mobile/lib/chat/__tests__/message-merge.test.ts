// apps/mobile/lib/chat/__tests__/message-merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeIncoming, isWhisperVisibleTo, type ChatMessage } from '../message-merge';

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

  // 잠재 결함(agent team 발굴): clientMsgId 가 같아도 userId 가 다르면 서로 다른
  // 메시지다 — 서버 dedup 키는 (room,user,client_msg_id). userId 미비교로 다른
  // 사용자의 메시지를 오매칭/덮어쓰면 안 된다.
  it('does NOT reconcile across different users even with same clientMsgId', () => {
    const mine: ChatMessage = { ...base, id: 'tmp-1', userId: 'me', body: '내 메시지', sendState: 'sending' };
    const otherUserSameClientId: ChatMessage = {
      ...base,
      id: 'srv-other',
      userId: 'u2',
      body: '남의 메시지',
      createdAt: '2026-05-30T00:00:05Z',
      sendState: 'sent',
    };
    const out = mergeIncoming([mine], otherUserSameClientId);
    // 오매칭 시 1건으로 합쳐지고 내 낙관 메시지가 사라진다 → 2건이어야 정상.
    expect(out).toHaveLength(2);
    const mineStill = out.find((m) => m.userId === 'me');
    const other = out.find((m) => m.userId === 'u2');
    expect(mineStill?.body).toBe('내 메시지');
    expect(other?.body).toBe('남의 메시지');
  });

  it('reconciles same-user same-clientMsgId (normal optimistic echo) — userId guard does not block legit match', () => {
    const optimistic: ChatMessage = { ...base, id: 'tmp-2', userId: 'me', sendState: 'sending' };
    const echo: ChatMessage = { ...base, id: 'srv-2', userId: 'me', sendState: 'sent' };
    const out = mergeIncoming([optimistic], echo);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('srv-2');
  });

  it('preserves whisperToUserId through optimistic→server reconcile', () => {
    const optimistic: ChatMessage = { ...base, id: 'tmp-3', clientMsgId: 'cw', userId: 'me', whisperToUserId: 'u2', sendState: 'sending' };
    const echo: ChatMessage = { ...base, id: 'srv-3', clientMsgId: 'cw', userId: 'me', whisperToUserId: 'u2', sendState: 'sent' };
    const out = mergeIncoming([optimistic], echo);
    expect(out).toHaveLength(1);
    expect(out[0].whisperToUserId).toBe('u2');
    expect(out[0].sendState).toBe('sent');
  });
});

// 귓속말 가시성 belt(클라 방어선) — useRoomChat realtime drop 의 순수 로직.
describe('isWhisperVisibleTo', () => {
  const w = (whisperToUserId: string | null, userId: string) => ({ whisperToUserId, userId });

  it('전체 채팅(whisperToUserId=null)은 누구에게나 보인다', () => {
    expect(isWhisperVisibleTo(w(null, 'u1'), 'me')).toBe(true);
    expect(isWhisperVisibleTo(w(null, 'me'), 'me')).toBe(true);
  });

  it('내가 받은 귓속말(대상=self)은 보인다', () => {
    expect(isWhisperVisibleTo(w('me', 'u1'), 'me')).toBe(true);
  });

  it('내가 보낸 귓속말(발신=self)은 보인다', () => {
    expect(isWhisperVisibleTo(w('u2', 'me'), 'me')).toBe(true);
  });

  it('제3자 귓속말(발신·대상 모두 ≠ self)은 drop 된다', () => {
    expect(isWhisperVisibleTo(w('u2', 'u1'), 'me')).toBe(false);
  });
});

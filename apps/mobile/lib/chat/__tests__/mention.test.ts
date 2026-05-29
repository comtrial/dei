import { describe, expect, it } from 'vitest';
import { parseMentionQuery, filterCandidates, type RoomMemberLite } from '../mention';

const MEMBERS: RoomMemberLite[] = [
  { userId: 'me', name: '나', status: 'active' },
  { userId: 'u1', name: '수아', status: 'active' },
  { userId: 'u2', name: '수민', status: 'active' },
  { userId: 'u3', name: '민준', status: 'left' },
];

describe('mention parsing', () => {
  it('detects @query at caret tail', () => {
    expect(parseMentionQuery('안녕 @수')).toEqual({ active: true, query: '수' });
    expect(parseMentionQuery('안녕하세요')).toEqual({ active: false, query: '' });
    expect(parseMentionQuery('@')).toEqual({ active: true, query: '' });
  });

  it('filters out self, blocked, left; prefix-matches name', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set() });
    expect(out.map((m) => m.userId)).toEqual(['u1', 'u2']); // 수아, 수민; 나(self) 제외, 민준(left) 제외
  });

  it('excludes blocked ids', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set(['u1']) });
    expect(out.map((m) => m.userId)).toEqual(['u2']);
  });
});

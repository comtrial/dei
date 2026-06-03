import { describe, expect, it } from 'vitest';
import {
  parseMentionQuery,
  filterCandidates,
  resolveTailMention,
  resolveLeadingMention,
  type RoomMemberLite,
} from '../mention';

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

  it('absorbs leading duplicate @ (input-parse-6)', () => {
    // '@@' → query '' (둘째 @ 까지 흡수), '@@수' → query '수' (마지막 @ 만 트리거)
    expect(parseMentionQuery('@@')).toEqual({ active: true, query: '' });
    expect(parseMentionQuery('@@수')).toEqual({ active: true, query: '수' });
    expect(parseMentionQuery('안녕 @@수아')).toEqual({ active: true, query: '수아' });
  });

  it('filters out self, blocked, left; prefix-matches name', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set() });
    expect(out.map((m) => m.userId)).toEqual(['u1', 'u2']); // 수아, 수민; 나(self) 제외, 민준(left) 제외
  });

  it('excludes blocked ids', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set(['u1']) });
    expect(out.map((m) => m.userId)).toEqual(['u2']);
  });

  // 엣지(agent team 발굴).
  it('empty query (@만 입력) → 후보는 active·non-self·non-blocked 전원', () => {
    const out = filterCandidates(MEMBERS, '', { selfId: 'me', blockedIds: new Set() });
    expect(out.map((m) => m.userId)).toEqual(['u1', 'u2']); // 나(self)·민준(left) 제외
  });

  it('case-insensitive prefix 매칭', () => {
    const m: RoomMemberLite[] = [{ userId: 'x', name: 'Alex', status: 'active' }];
    expect(filterCandidates(m, 'al', { selfId: 'me', blockedIds: new Set() }).map((c) => c.userId)).toEqual(['x']);
    expect(filterCandidates(m, 'AL', { selfId: 'me', blockedIds: new Set() }).map((c) => c.userId)).toEqual(['x']);
  });

  it('멤버 0명 / 전원 left·blocked → 후보 []', () => {
    expect(filterCandidates([], '수', { selfId: 'me', blockedIds: new Set() })).toEqual([]);
    const allOut: RoomMemberLite[] = [
      { userId: 'u1', name: '수아', status: 'left' },
      { userId: 'u2', name: '수민', status: 'active' },
    ];
    expect(filterCandidates(allOut, '수', { selfId: 'me', blockedIds: new Set(['u2']) })).toEqual([]);
  });
});

// Bug4: '@풀네임 본문' 처럼 이름 뒤에 본문이 오는 인라인 멘션 → 귓속말 확정.
// (resolveTailMention 은 tail @토큰만 봐서 '@수아 안녕' 은 평문으로 새어나갔다.)
describe('resolveLeadingMention (인라인 @풀네임 본문)', () => {
  const opts = { selfId: 'me', blockedIds: new Set<string>() };

  it("'@수아 안녕' → confirmed + strippedInput='안녕'", () => {
    const r = resolveLeadingMention('@수아 안녕', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.target?.userId).toBe('u1');
    expect(r.strippedInput).toBe('안녕');
  });

  it("'@수아 여러 단어 본문' → 본문 전체 보존", () => {
    const r = resolveLeadingMention('@수아 오늘 카페 갈래?', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.strippedInput).toBe('오늘 카페 갈래?');
  });

  it("'@@수아 안녕'(선행 @ 다수) → 흡수 후 confirmed", () => {
    const r = resolveLeadingMention('@@수아 안녕', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.target?.userId).toBe('u1');
    expect(r.strippedInput).toBe('안녕');
  });

  it("'@수 안녕'(prefix-만, 완전일치 아님) → ambiguous(자동확정 금지)", () => {
    const r = resolveLeadingMention('@수 안녕', MEMBERS, opts);
    expect(r.kind).toBe('ambiguous');
  });

  it("'@나 안녕'(self) → none(누설 차단, 평문)", () => {
    const r = resolveLeadingMention('@나 안녕', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });

  it("'@민준 안녕'(left 멤버) → none", () => {
    const r = resolveLeadingMention('@민준 안녕', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });

  it("'@수아'(공백·본문 없음) → none(인라인 아님 — tail 로직이 처리)", () => {
    expect(resolveLeadingMention('@수아', MEMBERS, opts).kind).toBe('none');
  });

  it("'안녕 @수아 ...'(선두가 @ 아님) → none", () => {
    expect(resolveLeadingMention('안녕 @수아 봐', MEMBERS, opts).kind).toBe('none');
  });

  it("'@수아 '(본문 공백뿐) → none(보낼 본문 없음)", () => {
    expect(resolveLeadingMention('@수아   ', MEMBERS, opts).kind).toBe('none');
  });

  it('parseMentionQuery: @토큰은 개행을 넘지 않는다(\\S* 경계)', () => {
    // 마지막 줄이 @로 시작 안 하면 비active.
    expect(parseMentionQuery('@수\n아')).toEqual({ active: false, query: '' });
  });

  it('parseMentionQuery: 단어 경계 없는 @(이메일/URL 류)은 트리거 안 함', () => {
    // 'foo@bar' 의 @ 는 앞에 공백/줄머리가 없어 멘션으로 잡히지 않는다.
    expect(parseMentionQuery('foo@bar')).toEqual({ active: false, query: '' });
  });
});

describe('resolveTailMention (G-A 풀네임 자동 귓속말 해석)', () => {
  const opts = { selfId: 'me', blockedIds: new Set<string>() };

  it('완전일치 && 유일 → confirmed + tail @토큰 strip', () => {
    const r = resolveTailMention('안녕 @수아', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.target?.userId).toBe('u1');
    expect(r.strippedInput).toBe('안녕'); // tail '@수아' 제거(트레일링 공백도 정리)
  });

  it('완전일치 단일 — 본문 머리에 위치해도 strip', () => {
    const r = resolveTailMention('@수아', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.target?.userId).toBe('u1');
    expect(r.strippedInput).toBe('');
  });

  it("prefix-만-일치('@수' → 수아 1명만 active 라 가정해도 완전일치 아님)는 ambiguous 가 아니라 후보 수로 판정", () => {
    // 수아·수민 둘 다 active → 후보 2명 → ambiguous
    const r = resolveTailMention('@수', MEMBERS, opts);
    expect(r.kind).toBe('ambiguous');
    expect(r.strippedInput).toBeUndefined();
  });

  it("후보 2명 이상('@수' → 수아·수민) → ambiguous(자동확정 금지)", () => {
    const r = resolveTailMention('hi @수', MEMBERS, opts);
    expect(r.kind).toBe('ambiguous');
  });

  it('prefix 단일이지만 완전일치 아니면 ambiguous (평문 오발신 차단)', () => {
    const members: RoomMemberLite[] = [
      { userId: 'me', name: '나', status: 'active' },
      { userId: 'u1', name: '수아', status: 'active' },
    ];
    // '@수' → 후보 '수아' 1명, 그러나 query('수') !== name('수아') → 완전일치 아님 → ambiguous
    const r = resolveTailMention('@수', members, opts);
    expect(r.kind).toBe('ambiguous');
  });

  it('매칭 0명 → none (평문 전송)', () => {
    const r = resolveTailMention('@없는사람', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });

  it('self 닉네임은 후보 0 → none (누설 차단은 send 보류 아닌 평문, 자동확정 안 됨)', () => {
    const r = resolveTailMention('@나', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });

  it('left 멤버 닉네임은 후보 0 → none', () => {
    const r = resolveTailMention('@민준', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });

  it('blocked 대상은 후보에서 제외 → none', () => {
    const r = resolveTailMention('@수아', MEMBERS, {
      selfId: 'me',
      blockedIds: new Set(['u1']),
    });
    expect(r.kind).toBe('none');
  });

  it('@@흡수 후 완전일치 → confirmed (input-parse-6 연동)', () => {
    const r = resolveTailMention('@@수아', MEMBERS, opts);
    expect(r.kind).toBe('confirmed');
    expect(r.target?.userId).toBe('u1');
    expect(r.strippedInput).toBe('');
  });

  it('parseMentionQuery 비active(끝이 @아님) → none', () => {
    const r = resolveTailMention('수아 안녕', MEMBERS, opts);
    expect(r.kind).toBe('none');
  });
});

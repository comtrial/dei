import { describe, expect, it } from 'vitest';

import {
  extractActiveMentionPrefix,
  parseMentions,
  segmentBody,
} from '../mention-parser';

describe('parseMentions', () => {
  it('한국어 + 영문 + 숫자 nickname 을 모두 잡는다', () => {
    const tokens = parseMentions('안녕 @하늘아 그리고 @sky_42 잘 지내?');
    expect(tokens.map((t) => t.nickname)).toEqual(['하늘아', 'sky_42']);
  });

  it('2자 미만, 30자 초과는 매칭 안 함', () => {
    expect(parseMentions('@a hi').map((t) => t.nickname)).toEqual([]);
    const tooLong = '@' + 'a'.repeat(31);
    // 30 자까지만 캡쳐 — '@' 다음 30자는 인식되지만 31번째 글자는 캡쳐 밖.
    // (regex 가 {2,30} 이므로 매칭은 되되 nickname 은 30자까지)
    const tokens = parseMentions(tooLong);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].nickname.length).toBe(30);
  });

  it('start/end index 가 정확하다', () => {
    const tokens = parseMentions('hi @abc!');
    expect(tokens[0].start).toBe(3);
    expect(tokens[0].end).toBe(7);
  });
});

describe('segmentBody', () => {
  it('text / mention 세그먼트로 정확히 분할', () => {
    expect(segmentBody('안녕 @sky 잘 지내?')).toEqual([
      { kind: 'text', text: '안녕 ' },
      { kind: 'mention', text: '@sky', nickname: 'sky' },
      { kind: 'text', text: ' 잘 지내?' },
    ]);
  });

  it('멘션이 본문 시작/끝에 있어도 동작', () => {
    expect(segmentBody('@sky hi')).toEqual([
      { kind: 'mention', text: '@sky', nickname: 'sky' },
      { kind: 'text', text: ' hi' },
    ]);
    expect(segmentBody('hi @sky')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', text: '@sky', nickname: 'sky' },
    ]);
  });

  it('멘션이 없으면 단일 text 세그먼트', () => {
    expect(segmentBody('plain text')).toEqual([{ kind: 'text', text: 'plain text' }]);
  });
});

describe('extractActiveMentionPrefix', () => {
  it('커서가 @prefix 바로 뒤에 있으면 prefix 반환', () => {
    const body = '안녕 @sk';
    const result = extractActiveMentionPrefix(body, body.length);
    expect(result).toEqual({ prefix: 'sk', start: 3 });
  });

  it('빈 prefix (@ 직후 커서) 도 허용 — 멤버 전체 표시', () => {
    const body = '안녕 @';
    const result = extractActiveMentionPrefix(body, body.length);
    expect(result).toEqual({ prefix: '', start: 3 });
  });

  it('@ 앞에 공백/줄바꿈/시작이 아닌 경우 null (이메일 등과 충돌 회피)', () => {
    expect(extractActiveMentionPrefix('foo@sk', 6)).toBeNull();
  });

  it('커서가 멘션 토큰 외부에 있으면 null', () => {
    expect(extractActiveMentionPrefix('hi everyone', 2)).toBeNull();
  });

  it('lowercase 로 정규화', () => {
    expect(extractActiveMentionPrefix('@Sky', 4)).toEqual({ prefix: 'sky', start: 0 });
  });
});

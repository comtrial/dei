import { describe, expect, it } from 'vitest';
import { messageLength, isSendable, MAX_BODY } from '../length';

describe('chat length (code point)', () => {
  it('counts code points (이모지=2 code points for some)', () => {
    expect(messageLength('안녕')).toBe(2);
    expect(messageLength('a'.repeat(500))).toBe(500);
  });
  it('isSendable true for 1..500 trimmed', () => {
    expect(isSendable('안녕')).toBe(true);
    expect(isSendable('   ')).toBe(false);
    expect(isSendable('')).toBe(false);
    expect(isSendable('x'.repeat(501))).toBe(false);
  });
  it('MAX_BODY is 500', () => {
    expect(MAX_BODY).toBe(500);
  });

  // 경계/유니코드 엣지(agent team 발굴).
  it('isSendable: 정확히 500자 = true, 501자 = false (경계)', () => {
    expect(isSendable('x'.repeat(500))).toBe(true);
    expect(isSendable('x'.repeat(501))).toBe(false);
  });

  it('isSendable: 단일 문자 1자 = true (최소 경계)', () => {
    expect(isSendable('a')).toBe(true);
    expect(isSendable('한')).toBe(true);
  });

  it('isSendable: 앞뒤 공백은 trim 후 판정 (내용 있으면 전송 가능)', () => {
    expect(isSendable('   hello   ')).toBe(true);
    expect(isSendable('\n\t ')).toBe(false); // 공백/개행만 → 비전송
  });

  it('messageLength: 기본 이모지는 1 code point (서로게이트 페어 spread)', () => {
    expect(messageLength('😀')).toBe(1);
    expect(messageLength('hello 😀')).toBe(7);
  });

  it('messageLength: ZWJ 가족 이모지는 code point 합으로 계산(DB char_length 동일 단위)', () => {
    // 👨‍👩‍👧‍👦 = man zwj woman zwj girl zwj boy = 7 code points.
    expect(messageLength('👨‍👩‍👧‍👦')).toBe(7);
  });
});

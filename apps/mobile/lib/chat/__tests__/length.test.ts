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
});

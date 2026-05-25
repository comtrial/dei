import { describe, expect, it } from 'vitest';

import {
  blurGateRemainingMs,
  evaluateBlurGate,
  isFeedVisible,
  shouldWarnBlurReapply,
} from '../blur-gate';

const HOUR = 60 * 60 * 1000;
const REF = new Date('2026-05-26T09:00:00.000Z');

describe('evaluateBlurGate', () => {
  it('첫 진입(미업로드) 은 never-uploaded', () => {
    expect(evaluateBlurGate({ lastUploadedAt: null }, REF).kind).toBe('never-uploaded');
  });

  it('24h 이내 업로드는 open', () => {
    const lastUploadedAt = new Date(REF.getTime() - 23 * HOUR).toISOString();
    expect(evaluateBlurGate({ lastUploadedAt }, REF)).toEqual({ kind: 'open' });
  });

  it('정확히 24h 경과면 expired', () => {
    const lastUploadedAt = new Date(REF.getTime() - 24 * HOUR).toISOString();
    expect(evaluateBlurGate({ lastUploadedAt }, REF)).toEqual({
      kind: 'expired',
      lastUploadedAt,
    });
  });

  it('잘못된 ISO 는 never-uploaded 로 폴백', () => {
    expect(evaluateBlurGate({ lastUploadedAt: 'not-a-date' }, REF).kind).toBe(
      'never-uploaded',
    );
  });
});

describe('isFeedVisible', () => {
  it('open 만 true', () => {
    expect(isFeedVisible({ kind: 'open' })).toBe(true);
    expect(isFeedVisible({ kind: 'never-uploaded' })).toBe(false);
    expect(
      isFeedVisible({ kind: 'expired', lastUploadedAt: REF.toISOString() }),
    ).toBe(false);
  });
});

describe('shouldWarnBlurReapply', () => {
  it('23~24h 사이만 true', () => {
    const at23h = new Date(REF.getTime() - 23 * HOUR).toISOString();
    const at23h30m = new Date(REF.getTime() - 23.5 * HOUR).toISOString();
    const at24h = new Date(REF.getTime() - 24 * HOUR).toISOString();
    const at22h = new Date(REF.getTime() - 22 * HOUR).toISOString();

    expect(shouldWarnBlurReapply({ lastUploadedAt: at23h }, REF)).toBe(true);
    expect(shouldWarnBlurReapply({ lastUploadedAt: at23h30m }, REF)).toBe(true);
    expect(shouldWarnBlurReapply({ lastUploadedAt: at24h }, REF)).toBe(false); // already expired
    expect(shouldWarnBlurReapply({ lastUploadedAt: at22h }, REF)).toBe(false);
  });

  it('null 은 false', () => {
    expect(shouldWarnBlurReapply({ lastUploadedAt: null }, REF)).toBe(false);
  });
});

describe('blurGateRemainingMs', () => {
  it('남은 시간을 ms 단위로 반환 (24h - elapsed)', () => {
    const lastUploadedAt = new Date(REF.getTime() - 1 * HOUR).toISOString();
    expect(blurGateRemainingMs({ lastUploadedAt }, REF)).toBe(23 * HOUR);
  });

  it('만료된 경우 음수', () => {
    const lastUploadedAt = new Date(REF.getTime() - 25 * HOUR).toISOString();
    expect(blurGateRemainingMs({ lastUploadedAt }, REF)).toBeLessThan(0);
  });

  it('null 은 0', () => {
    expect(blurGateRemainingMs({ lastUploadedAt: null }, REF)).toBe(0);
  });
});

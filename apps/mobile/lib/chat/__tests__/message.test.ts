import { describe, expect, it } from 'vitest';

import {
  MESSAGE_MAX,
  classifySendFailure,
  evaluateComposer,
  graphemeLength,
} from '../message';

describe('graphemeLength', () => {
  it('일반 텍스트 길이', () => {
    expect(graphemeLength('hello')).toBe(5);
    expect(graphemeLength('안녕하세요')).toBe(5);
  });

  it('emoji / ZWJ sequence 를 1 grapheme 으로 (Segmenter 환경)', () => {
    // Node 18+ 는 Intl.Segmenter 보유 → 가족 이모지는 1 cluster.
    const len = graphemeLength('👨‍👩‍👧');
    expect(len).toBeGreaterThanOrEqual(1);
    expect(len).toBeLessThanOrEqual(3);
  });
});

describe('evaluateComposer (CH2 컴포저)', () => {
  it('0자 → 전송 불가', () => {
    const s = evaluateComposer('');
    expect(s.canSend).toBe(false);
    expect(s.length).toBe(0);
  });

  it('공백만 → trim 후 0자 → 전송 불가', () => {
    const s = evaluateComposer('   ');
    expect(s.canSend).toBe(false);
  });

  it('1자 → 전송 가능', () => {
    const s = evaluateComposer('a');
    expect(s.canSend).toBe(true);
  });

  it('500자 → 전송 가능 (경계)', () => {
    const s = evaluateComposer('x'.repeat(500));
    expect(s.length).toBe(500);
    expect(s.canSend).toBe(true);
    expect(s.isOverLimit).toBe(false);
  });

  it('501자 → 전송 불가 + over limit', () => {
    const s = evaluateComposer('x'.repeat(501));
    expect(s.canSend).toBe(false);
    expect(s.isOverLimit).toBe(true);
  });

  it('489자 → danger 아님, 490자 → danger (카운터 빨강)', () => {
    expect(evaluateComposer('x'.repeat(489)).isDanger).toBe(false);
    expect(evaluateComposer('x'.repeat(490)).isDanger).toBe(true);
  });

  it('MESSAGE_MAX 상수는 500', () => {
    expect(MESSAGE_MAX).toBe(500);
  });
});

describe('classifySendFailure (10-E)', () => {
  it('reason=BLOCKED → 비재시도 + FULL-spec 정합 메시지 (P1-6)', () => {
    const f = classifySendFailure({ reason: 'BLOCKED', retryable: false });
    expect(f.reason).toBe('BLOCKED');
    expect(f.retryable).toBe(false);
    expect(f.message).toBe('더 이상 대화할 수 없습니다');
  });

  it('reason=ENDED → 비재시도 + FULL-spec 정합 메시지 (P1-6)', () => {
    const f = classifySendFailure({ reason: 'ENDED', retryable: false });
    expect(f.reason).toBe('ENDED');
    expect(f.retryable).toBe(false);
    expect(f.message).toBe('종료된 대화입니다');
  });

  it('RPC message "blocked" → BLOCKED', () => {
    const f = classifySendFailure({ message: 'blocked' });
    expect(f.reason).toBe('BLOCKED');
    expect(f.retryable).toBe(false);
  });

  it('RPC message "conversation is not active" → ENDED', () => {
    const f = classifySendFailure({ message: 'conversation is not active' });
    expect(f.reason).toBe('ENDED');
    expect(f.retryable).toBe(false);
  });

  it('"not a participant" → FORBIDDEN', () => {
    const f = classifySendFailure({ message: 'not a participant' });
    expect(f.reason).toBe('FORBIDDEN');
    expect(f.retryable).toBe(false);
  });

  it('"1..500" 길이 위반 → INVALID 비재시도', () => {
    const f = classifySendFailure({ message: 'message body must be 1..500 chars' });
    expect(f.reason).toBe('INVALID');
    expect(f.retryable).toBe(false);
  });

  it('알 수 없는 5xx → NETWORK 재시도 (인라인 retry 마커)', () => {
    const f = classifySendFailure({ message: 'something exploded', retryable: true });
    expect(f.reason).toBe('NETWORK');
    expect(f.retryable).toBe(true);
  });

  it('reason/message 없음 → 기본 NETWORK 재시도', () => {
    const f = classifySendFailure({});
    expect(f.reason).toBe('NETWORK');
    expect(f.retryable).toBe(true);
  });
});

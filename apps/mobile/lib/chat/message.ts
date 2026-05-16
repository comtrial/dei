/**
 * CH2 메시지 컴포저 순수 로직 (글자 수 검증 / 카운터 / 전송 가능).
 *
 * DEV-SPEC.md §1 CH2:
 *   - grapheme cluster 1~500자
 *   - 카운터 표시, 490자+ 빨강
 *   - 전송 버튼 활성: 1~500자 / 비활성: 0자 또는 501+자
 *
 * 전송 실패 분류 (10-E): edge function 응답 { reason, retryable } 또는
 * RPC 에러 message 를 사용자/재시도 정책으로 환원.
 */

export const MESSAGE_MIN = 1;
export const MESSAGE_MAX = 500;
/** 이 길이 이상이면 카운터를 빨강으로 (DEV-SPEC: 490자+). */
export const MESSAGE_COUNTER_DANGER = 490;

/**
 * grapheme cluster 기준 길이. Intl.Segmenter 가 있으면 그것을, 없으면
 * Array.from (code point) 으로 폴백. (서버 send_message 는 char_length 를
 * 쓰므로 클라 카운터는 사용자 체감용 — 경계는 서버가 최종 판정.)
 */
export function graphemeLength(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const segmenter = new Seg(undefined, { granularity: 'grapheme' });
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _segment of segmenter.segment(text)) count += 1;
    return count;
  }
  return Array.from(text).length;
}

export interface ComposerState {
  length: number;
  /** 1~500 → true. */
  canSend: boolean;
  /** 490자 이상 → 카운터 빨강. */
  isDanger: boolean;
  /** 500자 초과. */
  isOverLimit: boolean;
}

export function evaluateComposer(text: string): ComposerState {
  const length = graphemeLength(text.trim());
  return {
    length,
    canSend: length >= MESSAGE_MIN && length <= MESSAGE_MAX,
    isDanger: length >= MESSAGE_COUNTER_DANGER,
    isOverLimit: length > MESSAGE_MAX,
  };
}

export type SendFailureReason = 'BLOCKED' | 'ENDED' | 'INVALID' | 'FORBIDDEN' | 'NETWORK';

export interface SendFailure {
  reason: SendFailureReason;
  /** 사용자 토스트/인라인 메시지. */
  message: string;
  /** true = 인라인 retry 마커 표시 (10-E). false = 토스트 후 CH2 닫힘 등. */
  retryable: boolean;
}

/**
 * edge function / RPC 에러 → SendFailure 로 정규화.
 * Backend 인터페이스: edge `{ error, reason, retryable }`,
 * RPC 에러 message 예: `blocked`, `conversation is not active`,
 * `not a participant`, `1..500`.
 */
export function classifySendFailure(input: {
  reason?: string | null;
  retryable?: boolean | null;
  message?: string | null;
}): SendFailure {
  const reason = (input.reason ?? '').toUpperCase();
  const msg = (input.message ?? '').toLowerCase();

  // 사용자 노출 문자열은 FULL-spec chat_route_resolved payload 와 정합
  // (BLOCKED="더 이상 대화할 수 없습니다", ENDED="종료된 대화입니다").
  if (reason === 'BLOCKED' || /blocked/.test(msg)) {
    return {
      reason: 'BLOCKED',
      message: '더 이상 대화할 수 없습니다',
      retryable: false,
    };
  }
  if (reason === 'ENDED' || /not active|conversation ended/.test(msg)) {
    return {
      reason: 'ENDED',
      message: '종료된 대화입니다',
      retryable: false,
    };
  }
  if (/not a participant|forbidden/.test(msg)) {
    return {
      reason: 'FORBIDDEN',
      message: '이 대화에 참여하고 있지 않아요.',
      retryable: false,
    };
  }
  if (/1\.\.500|must be 1\.\.500|body length|between 1 and 500/.test(msg)) {
    return {
      reason: 'INVALID',
      message: '메시지는 1~500자여야 해요.',
      retryable: false,
    };
  }

  // 네트워크/일시 장애 (5xx) — retryable=true 면 인라인 재시도.
  const retryable = input.retryable ?? true;
  return {
    reason: 'NETWORK',
    message: '전송에 실패했어요. 다시 시도해 주세요.',
    retryable,
  };
}

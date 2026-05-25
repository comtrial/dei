/**
 * 블러 게이트 정책 — D6, 순수 함수.
 *
 * 단일 규칙: "내가 올린 영상이 24시간 안에 존재해야 남의 영상이 보인다."
 * 첫 진입과 운영 중을 하나의 메커니즘으로 통일 (PRD 6장).
 *
 * 실제 가시성 차단은 DB RLS (`hourly_uploads_select_blur_gate`) 가 처리한다.
 * 이 모듈은 클라가 **UI 표시 / 사전 안내**를 위해 같은 규칙을 평가할 때 쓴다.
 */

const BLUR_GATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const BLUR_REAPPLY_WARNING_MS = 23 * 60 * 60 * 1000;

export type BlurGateState =
  | { kind: 'open' }                         // 본인 24h 이내 업로드 있음 → 피드 열림
  | { kind: 'never-uploaded' }               // 방 진입 후 첫 업로드 전
  | { kind: 'expired'; lastUploadedAt: string }; // 24h 경과 → 재적용

export type BlurGateUploadProbe = {
  /** ISO timestamp of the user's most recent upload in this room, or null. */
  lastUploadedAt: string | null;
};

/**
 * 본인 마지막 업로드 시각을 기준으로 블러 게이트 상태를 판정.
 *
 * @param probe.lastUploadedAt 본인이 이 방에 마지막으로 올린 영상 시각 (없으면 null)
 * @param now                  판정 기준 시각 (default: Date.now)
 */
export function evaluateBlurGate(
  probe: BlurGateUploadProbe,
  now: Date = new Date(),
): BlurGateState {
  if (!probe.lastUploadedAt) {
    return { kind: 'never-uploaded' };
  }
  const last = new Date(probe.lastUploadedAt).getTime();
  if (Number.isNaN(last)) {
    return { kind: 'never-uploaded' };
  }
  const elapsed = now.getTime() - last;
  if (elapsed >= BLUR_GATE_WINDOW_MS) {
    return { kind: 'expired', lastUploadedAt: probe.lastUploadedAt };
  }
  return { kind: 'open' };
}

/**
 * 블러 재적용 경고 (`blur_gate_reapplied` 알림) 발송 시점 판정.
 *
 * 마지막 업로드가 23~24h 사이일 때 true.
 */
export function shouldWarnBlurReapply(
  probe: BlurGateUploadProbe,
  now: Date = new Date(),
): boolean {
  if (!probe.lastUploadedAt) return false;
  const last = new Date(probe.lastUploadedAt).getTime();
  if (Number.isNaN(last)) return false;
  const elapsed = now.getTime() - last;
  return elapsed >= BLUR_REAPPLY_WARNING_MS && elapsed < BLUR_GATE_WINDOW_MS;
}

/**
 * 블러 게이트 상태가 "피드가 보임" 인지 여부 (편의 함수).
 */
export function isFeedVisible(state: BlurGateState) {
  return state.kind === 'open';
}

/**
 * 24h 남은 시간 (ms). 양수면 아직 열려 있고, 0 이하면 블러 재적용 대상.
 */
export function blurGateRemainingMs(
  probe: BlurGateUploadProbe,
  now: Date = new Date(),
): number {
  if (!probe.lastUploadedAt) return 0;
  const last = new Date(probe.lastUploadedAt).getTime();
  if (Number.isNaN(last)) return 0;
  return BLUR_GATE_WINDOW_MS - (now.getTime() - last);
}

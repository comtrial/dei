import { describe, expect, it, vi, beforeEach } from 'vitest';

// posthog 모듈을 mock — getFeatureFlag 반환값을 케이스별로 제어. onFeatureFlags 는
// 구독 콜백을 보관해 수동 트리거(플래그 도착 시뮬레이션)할 수 있게 한다.
const getFeatureFlag = vi.fn();
let flagListener: (() => void) | null = null;
const onFeatureFlags = vi.fn((cb: () => void) => {
  flagListener = cb;
  return () => {
    flagListener = null;
  };
});
vi.mock('@/lib/posthog', () => ({
  getFeatureFlag: (k: string) => getFeatureFlag(k),
  onFeatureFlags: (cb: () => void) => onFeatureFlags(cb),
}));

import { resolveChatPresentationMode, CHAT_OVERLAY_FLAG } from '../presentation';

describe('resolveChatPresentationMode (피처 플래그)', () => {
  beforeEach(() => getFeatureFlag.mockReset());

  it("플래그 'overlay' → overlay", () => {
    getFeatureFlag.mockReturnValue('overlay');
    expect(resolveChatPresentationMode()).toBe('overlay');
  });

  it('플래그 boolean true → overlay', () => {
    getFeatureFlag.mockReturnValue(true);
    expect(resolveChatPresentationMode()).toBe('overlay');
  });

  it("플래그 'legacy' / false → legacy", () => {
    getFeatureFlag.mockReturnValue('legacy');
    expect(resolveChatPresentationMode()).toBe('legacy');
    getFeatureFlag.mockReturnValue(false);
    expect(resolveChatPresentationMode()).toBe('legacy');
  });

  it('플래그 미수신(undefined) → 안전 기본값 legacy', () => {
    getFeatureFlag.mockReturnValue(undefined);
    expect(resolveChatPresentationMode()).toBe('legacy');
    expect(getFeatureFlag).toHaveBeenCalledWith(CHAT_OVERLAY_FLAG);
  });
});

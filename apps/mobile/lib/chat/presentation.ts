// apps/mobile/lib/chat/presentation.ts
//
// 채팅 진입 방식(프레젠테이션 모드) 피처 플래그.
//  - 'legacy'  : 기존 — 별도 화면(opaque)으로 push.
//  - 'overlay' : 신규 — 매칭된 방 영상 위 반투명 오버레이(transparentModal + scrim).
//
// 원격 제어(앱 재배포 없이 분기): PostHog 피처 플래그 `chat-overlay-mode`
// (string: 'legacy'|'overlay' 또는 boolean: true=overlay). 운영/관리자/AB 에서
// 이 플래그만 바꾸면 화면 노출이 전환된다. 안전 기본값은 'legacy'(검증된 기존 동작) —
// 플래그 미수신·롤백 시 기존 화면으로 폴백된다.
import { useEffect, useState } from 'react';

import { getFeatureFlag, onFeatureFlags } from '@/lib/posthog';

export type ChatPresentationMode = 'legacy' | 'overlay';

/** PostHog 플래그 키(운영에서 이 키로 분기). */
export const CHAT_OVERLAY_FLAG = 'chat-overlay-mode';

/**
 * 빌드타임 강제 override(개발/검증용). EXPO_PUBLIC_CHAT_PRESENTATION 가 설정되면
 * 원격 플래그보다 우선한다('legacy'|'overlay'). 미설정 시 원격 플래그 → 기본값.
 */
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_CHAT_PRESENTATION as
  | ChatPresentationMode
  | undefined;

/** 원격 플래그 값(string|boolean|undefined)을 모드로 정규화. */
function normalize(flag: boolean | string | undefined): ChatPresentationMode | undefined {
  if (flag === 'overlay' || flag === true) return 'overlay';
  if (flag === 'legacy' || flag === false) return 'legacy';
  return undefined;
}

/**
 * 현재 채팅 프레젠테이션 모드를 해석한다.
 * 우선순위: env override → PostHog 플래그 → 기본 'legacy'.
 */
export function resolveChatPresentationMode(): ChatPresentationMode {
  if (ENV_OVERRIDE === 'legacy' || ENV_OVERRIDE === 'overlay') return ENV_OVERRIDE;
  return normalize(getFeatureFlag(CHAT_OVERLAY_FLAG)) ?? 'legacy';
}

/**
 * 반응형 훅 — 현재 채팅 프레젠테이션 모드. PostHog 플래그는 **비동기**로 도착하므로
 * 첫 렌더 시 legacy 로 떨어졌다가, 플래그가 로드/갱신되면(onFeatureFlags) 재평가해
 * overlay 로 전환된다(Bug3: 디바이스에 플래그 반영 안 되던 문제). env override 가
 * 있으면 그 값으로 고정(구독 불필요).
 */
export function useChatPresentationMode(): ChatPresentationMode {
  const [mode, setMode] = useState<ChatPresentationMode>(resolveChatPresentationMode);
  useEffect(() => {
    if (ENV_OVERRIDE === 'legacy' || ENV_OVERRIDE === 'overlay') return;
    // 마운트 직후 한 번 재평가(이미 캐시된 플래그 반영) + 이후 변경 구독.
    setMode(resolveChatPresentationMode());
    const unsub = onFeatureFlags(() => setMode(resolveChatPresentationMode()));
    return unsub;
  }, []);
  return mode;
}

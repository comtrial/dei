/**
 * ⚠️ HANDOFF STUB — 영상 촬영/업로드/재생 (D-12, 이번 셋팅에서 미구현)
 * ==================================================================
 * 담당: 영상·방 = C.
 * 3초 촬영(S11/S11b), 분할 피드 8셀(S13, DS=`GridRoom`), 풀스크린 재생(S13b,
 * DS=`FullscreenVideo`), 블러 게이트(24h sliding window — policy.ts `blurGate`
 * 참조)가 모두 C 담당이다. `expo-camera`/`expo-image-picker` 는 설치돼 있으나
 * 업로드/스토리지/블러 로직은 붙이지 않았다.
 *
 * 이 stub 은 video/upload 테이블 연동 경계 시그니처만 고정한다.
 */
const HANDOFF = 'handoff: 영상 촬영/업로드/재생(C) 구현 예정';

/** 3초 영상 촬영(현장 카메라만, 갤러리 금지 — dei 정체성). */
export async function recordClip(): Promise<{ localUri: string; durationMs: number }> {
  throw new Error(HANDOFF);
}

/** 촬영본 업로드 → Supabase storage + `upload`/`video` 행 생성. */
export async function uploadClip(_args: { roomId: string; localUri: string }): Promise<{ videoId: string }> {
  throw new Error(HANDOFF);
}

/**
 * 블러 게이트 가시성 판정(24h sliding window). 실제 정책 값은
 * `@dei/shared` policy.ts `blurGate` 가 SSOT. 여기선 경계만.
 */
export async function isClipVisible(_args: { videoId: string; viewerId: string }): Promise<boolean> {
  throw new Error(HANDOFF);
}

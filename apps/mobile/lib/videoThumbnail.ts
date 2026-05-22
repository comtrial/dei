/**
 * 클라이언트 측 동적 썸네일 추출 — 비활성화.
 *
 * 결정 이력
 *   - 이전: `thumbnail_path` 가 없는 영상에 대해 클라가 즉석에서 첫 프레임을
 *     추출해 캐시하는 폴백을 운영했음.
 *   - 변경 사유: 원격 URL 의 첫 프레임 추출은 iOS 환경에서 unreliable
 *     (`resource unavailable` 등). 실패 noise / 배터리 / CPU 비용 대비 UX 이득
 *     (첫 프레임이 잠깐 더 빨리 보이기) 이 작다.
 *   - 신규 영상은 업로드 시 서버에 `thumbnail_path` (정적 이미지) 를 함께 저장하므로
 *     `VideoWithPoster` 가 그쪽을 우선 사용한다.
 *   - 구 영상 (`thumbnail_path` NULL) 은 검은 배경에서 곧바로 재생되는 기존 동작으로
 *     자연스럽게 폴백한다.
 *
 * 호출 지점 (`VideoWithPoster`, `useHomeScreen`, `useProfileFeed`) 의 API 시그니처는
 * 그대로 유지하고 내부만 no-op 으로 처리한다. 향후 서버 측 backfill 완료 후 호출
 * 자체를 정리해도 무방하다. 롤백이 필요하면 git history 의 이전 구현을 되돌리면 된다.
 */

export async function getOrCreatePoster(
  _videoUrl: string | null | undefined,
  _cacheKey?: string | null,
): Promise<string | null> {
  return null;
}

export function prefetchPosters(
  _inputs: Array<{ videoUrl: string | null | undefined; cacheKey?: string | null }>,
): void {
  /* no-op */
}

# C-1 · 영상 서빙 최적화 (PM 우려 직결)

- **status**: in_progress
- **owner**: C (손승태)
- **priority**: **P0** — PM 명시 우려. 영상 끊김 = 비즈니스 메인 깨짐.
- **선행**: 핵심 결정 §1 (A 와 합의)
- **관련 task**: C-0 (uploadClip), L1-video-pipeline, S13/S13b/S10

---

## 0. 배경 (PM 메시지)

> 영상이 끊기거나 이러면 문제가 있어서… 영상 최적화와 매칭된 방 측면 최적화 신경 써달라.
> 다수 매칭 시스템으로 개편 → 성능 최적화·화면 배치·시간대별 관리 신경 쓸 부분 많음.

dei 의 비즈니스 메인은 **3초 영상 모자이크의 자연스러운 서빙**. 끊기면 핵심 가치 깨짐.

---

## 1. 핵심 결정 (A 와 합의) — 코드 짜기 전 필수

**🚨 S13 8셀 그리드의 셀 = 영상인가, 정적 썸네일인가?**

| 옵션 | 끊김 위험 | 데이터 비용 | 정체성 | 비고 |
|---|---|---|---|---|
| **A) 정적 jpg 썸네일 + 탭 시 풀스크린 영상** | ✅ 안전 | ✅ 낮음 | BeReal/Locket 패턴 | **권장** |
| B) muted autoplay loop 비디오 (셀 자체가 영상) | ❌ 8셀×7시간=56디코더, OOM | ❌ 폭증 | "시그너처" 감 ↑ | 비추천 |
| C) 가시영역만 autoplay (intersection) | ⚠️ 중간 | ⚠️ 중간 | 복잡 ↑ | 마지막 카드 |

**권장: A**.
- 셀 = 정적 썸네일(`expo-image` 캐시) + 우상단 ▶ 아이콘.
- 셀 탭 → 풀스크린(S13b) 에서만 영상 재생.
- 실 BeReal·Locket·셋로그 모두 이 패턴.
- "셀 = 영상" 시그너처는 풀스크린에서 회수.

→ **합의 결과를 여기 §1 결정란에 박는다:**

```
[x] 결정: 옵션 A — 셀 = 정적 jpg 썸네일 (expo-image), 탭 시 풀스크린(S13b) 영상 재생
[x] 합의 일자: 2026-05-30
[x] 합의자: 손승태 (권장 옵션 A 단독 채택, BeReal/Locket 패턴)
```

이 결정에 따라 §3, §4 의 구체 작업 항목이 분기됨.

---

## 2. 누락 항목 11개 (현 코드 베이스 기준)

| # | 항목 | 영향 | 해결 |
|---|---|---|---|
| 1 | `expo-video` `poster` 미사용 | 풀스크린 진입 시 검은 화면 1~2초 | §4-2 |
| 2 | prefetch 없음 | 풀스크린 swipe 마다 끊김 | §4-4 |
| 3 | signed URL N round-trip | 8셀 = 8 fetch | §3-2 |
| 4 | Storage CDN 명시 없음 | 한국 RTT ↑ | §3-1 |
| 5 | 업로드 인코딩 정규화 X | 4K 원본 그대로 → 다운로드 폭증 | §3-3 |
| 6 | lazy mount / virtualization | 56셀 OOM | C-2 로 분리 |
| 7 | realtime debounce | grid 깜빡임 | C-2 로 분리 |
| 8 | range request 명시 없음 | 첫 byte 지연 | §4-3 |
| 9 | timestrip 캐시 전략 X | 시간대 변경 시 fetch 재발급 | C-2 로 분리 |
| 10 | autoplay 정책 (옵션 B 선택 시) | 디코더 점유 끊김 | (옵션 B 시) §4-5 |
| 11 | finalize 누락 cron | 'processing' 영구 잔존 | L1-video-pipeline 로 |

---

## 3. 백엔드/스토리지 최적화

### 3-1. Supabase Storage CDN 활성화
- [ ] 프로젝트 대시보드에서 **Smart CDN** (image/video transformation + edge cache) 활성화.
- [ ] 버킷 `room-videos` `cacheControl` 헤더: `public, max-age=3600` (1시간) 이상.
- [ ] 한국 사용자가 메인 → 도쿄 리전인지 서울 리전인지 확인 (A 인프라 담당과).

### 3-2. signed URL 배치 발급
- [ ] **8셀 = 8 fetch 금지**. RPC 또는 함수로 한 번에 N개 signed URL 발급.
  ```ts
  // rpc('get_room_signed_urls', { p_room_id, p_hour_slot })
  // returns: video_id[], url[], thumbnail_url[]  (paired)
  ```
- [ ] signed URL TTL = 1시간 default. 클라가 그 안에 시간대 변경 가능하도록 충분.
- [ ] 클라에서 URL 만료 시 재발급 — `react-query` staleTime 50분 권장.

### 3-3. 업로드 인코딩 정규화 (`uploadClip` 안)
- [ ] **해상도 상한**: 720p (1280×720) — 3초 짜리 더 크면 무의미.
- [ ] **bitrate 상한**: 2 Mbps (3초 × 2Mbps = 750KB).
- [ ] **codec**: H.264 high profile (iOS·안드·웹 모두 호환). HEVC X (웹 호환 X).
- [ ] **frame rate**: 30fps cap.
- [ ] expo-camera `videoQuality='720p'` + `videoBitrate` 옵션 검토.
- [ ] 업로드 전 클라에서 사이즈 체크 — > 3MB 이면 거부 (encoding 실패 가정).

### 3-4. 썸네일 (jpg) 강제
- [ ] **클라가 업로드 시 영상 + 썸네일 둘 다 동시 업로드** (Edge Function ffmpeg wasm 의존도 ↓).
- [ ] `expo-video-thumbnails` `getThumbnailAsync(uri, { time: 0 })` 로 0초 frame jpg.
- [ ] jpg 사이즈 ≤ 50KB (quality 0.7) — 셀 표시용으로 충분.
- [ ] Storage path: `{roomId}/{userId}/{videoId}.jpg`.
- [ ] `video.thumbnail_path` 채우고 `status='ready'` 1번에 INSERT.
  → L1 Edge Function 의 finalize 가 불필요해짐 (또는 fallback 만).

---

## 4. 플레이어/캐시 최적화

### 4-1. 셀 = `expo-image` 썸네일 (옵션 A 채택 시)
- [ ] S13 GridRoom 의 `media` slot 에 `<Image source={{ uri: thumbnailUrl }} />` (expo-image).
- [ ] `expo-image` 는 메모리·디스크 캐시 자동 + Smart CDN 정합.
- [ ] placeholder = `expo-image` `placeholder` prop 으로 blurhash 또는 그라데이션.
- [ ] 우상단 작은 ▶ 아이콘으로 "영상" 시그널.

### 4-2. `expo-video` `poster` 사용
- [ ] FullscreenVideo (S13b) 에서 `expo-video` 의 `useVideoPlayer({ poster })` 또는
      `VideoView posterSource={...}` 사용.
- [ ] 로드 전·동안 썸네일 jpg 노출 → 검은 화면 0건.
- [ ] 핸들: `player.replace({ uri, headers })` 로 source 교체 시 poster 유지.

### 4-3. range / streaming 활용
- [ ] `expo-video` 는 기본적으로 range 요청 지원. Supabase Storage 도 지원.
- [ ] 3초 영상이라 별도 HLS 분할 불필요 — 단일 mp4 + range 로 충분.
- [ ] 단, 첫 byte 시간 단축 위해 `bufferOptions.preferredForwardBufferDuration: 1` (1초만 미리 받음).

### 4-4. prefetch (swipe 끊김 방지)
- [ ] S13b 진입 시 같은 hour_slot 의 sibling video URL 들을 미리 fetch.
- [ ] `expo-image` 로 thumbnail prefetch: `Image.prefetch([url1, url2, ...])`.
- [ ] `expo-video` 자체 prefetch: 직전·직후 2개 video URL 의 `useVideoPlayer` 인스턴스
      미리 만들고 `player.preload = true` (또는 첫 1초만 fetch).
- [ ] 현재 영상 + 1 (사용자가 다음 swipe 할 가능성 ↑) 만 적극 prefetch — 전부 하면 데이터 폭증.

### 4-5. autoplay 정책 (옵션 B/C 채택 시만)
- [ ] viewport 안 셀만 재생 — `IntersectionObserver` (웹) / `viewabilityConfig` (FlatList native).
- [ ] muted + loop + playsInline.
- [ ] backgrounded 시 즉시 pause.
- [ ] **동시 디코더 ≤ 4** 권장 (iOS H.264 동시 디코더 한계).

---

## 5. 모니터링 / 측정

영상 끊김은 측정 안 하면 개선 못 함:

- [ ] PostHog 이벤트 추가 (taxonomy 에 등록):
  - `video_load_started` (videoId, hour_slot)
  - `video_first_frame_rendered` (videoId, latency_ms)
  - `video_stalled` (videoId, position_ms, reason) — buffer underrun
  - `video_error` (videoId, error_code)
- [ ] Sentry 측정 — 영상 로드 실패 자동 캡처 (`@dei/shared` logger).
- [ ] 가능하면 `Performance.now()` 로 첫 frame 까지 시간 측정 → 분포 통계.
- [ ] **dashboard**: p50/p95 first-frame latency, stall rate, error rate.

---

## 6. 정책 (L2)

기존 `POLICY.video` 에 다음 추가 검토 (A 와 합의 후 PR):

```ts
video: {
  // 기존
  retentionAfterRoomEndDays: 30,
  cameraOnlyNoGallery: true,
  purgeOnAccountDeletionHours: 24,

  // 신규 권장
  maxResolution: { w: 1280, h: 720 } as const,
  maxBitrateKbps: 2000,
  maxDurationMs: 3000,
  maxFileSizeBytes: 3 * 1024 * 1024,        // 3MB
  thumbnailMaxSizeBytes: 50 * 1024,          // 50KB
  prefetchSiblingCount: 1,                   // 직전·직후 1개
}
```

---

## 7. 테스트

- **unit**: 인코딩 정규화 옵션 (해상도 cap) — mock recordClip 결과 검증.
- **integration**: 업로드 → `video.thumbnail_path` 존재 확인. signed URL 배치 RPC 응답 N개 확인.
- **performance**:
  - Lighthouse 또는 자체 측정으로 S13 첫 로드 ~ 첫 썸네일 표시 ≤ 1.5초.
  - 풀스크린 진입 ~ 첫 frame ≤ 800ms.
  - 풀스크린 swipe ~ 다음 영상 첫 frame ≤ 400ms (prefetch 효과).
- **e2e-realdb**: 3G throttling 환경에서도 stall rate < 5%.
- **실기**: iOS Safari + Android Chrome + 실 디바이스 카메라 → 끊김 시각 검증 (영상 녹화 후 즉시 S13 진입).

---

## 8. 완료 정의 (DoD)

- [ ] §1 핵심 결정 합의 완료 + 본 문서에 박음.
- [ ] §3 백엔드 4 항목 + §4 플레이어 5 항목 (옵션 B/C 면 5 도) 완료.
- [ ] §5 PostHog 이벤트 4종 추가 + taxonomy 등록.
- [ ] §7 performance 메트릭 모두 기준선 통과.
- [ ] A 1차 리뷰 OK.
- [ ] PM 시연 OK ("끊김 없는지" 직접 확인).

---

## 9. 참고

- expo-video 공식 — https://docs.expo.dev/versions/latest/sdk/video/
- expo-image 캐시 — https://docs.expo.dev/versions/latest/sdk/image/#cachepolicy
- Supabase Smart CDN — https://supabase.com/docs/guides/storage/cdn/smart-cdn
- BeReal 패턴 분석 — 셀 = 정적 사진 / 탭 → 상세

# C-0 · 영상 모듈 (recordClip / uploadClip / isClipVisible)

- **status**: pending
- **owner**: C (손승태)
- **priority**: P0 (모든 촬영·방 화면이 여기 의존)
- **대상 파일**: `apps/mobile/lib/video.stub.ts` → 실구현으로 교체
- **DB 테이블**: `video` (필드: `id, room_id, user_id, storage_path, thumbnail_path, duration_ms, hour_slot, status, created_at`)
- **Storage 버킷**: `room-videos` (신규 생성 필요)
- **선행**: 없음 (가장 먼저)

---

## 1. 목적

`lib/video.stub.ts` 의 3 함수가 throw 만 함. 실제로 동작하게 채운다. 이 모듈
완성 = S11/S11b/S10/S13 전부 dataflow 가능해진다.

- `recordClip()` — 3초 영상 촬영. 현장 카메라만, 갤러리 금지(dei 정체성).
- `uploadClip({ roomId, localUri })` — Supabase Storage 업로드 + `video` row INSERT.
- `isClipVisible({ videoId, viewerId })` — blur 게이트 24h sliding window 판정.

---

## 2. 의존

- **expo-camera** — 이미 설치돼 있음. 권한 = `lib/permissions.ts`.
- **expo-image-picker** — 설치돼 있지만 **사용 금지** (갤러리 X 정책 — D8 / `POLICY.video.cameraOnlyNoGallery`).
- **expo-file-system / expo-av** — 로컬 영상 파일 핸들링, 길이 측정.
- **Supabase Storage** — 신규 버킷 `room-videos` 생성 + RLS.
- **`POLICY.blurGate.visibilityWindowHours`** = 24 (SSOT).
- **`POLICY.video.retentionAfterRoomEndDays`** = 30 (방 종료 후 보관).

---

## 3. 합의 필요 (A ↔ C)

이 task 시작 전 README §2 + **`C-1-video-performance.md`** 합의 결과 다음 결정:

- [ ] `room-videos` 버킷 명세 (path: `{room_id}/{user_id}/{video_id}.mp4`)
- [ ] **썸네일 path** `{room_id}/{user_id}/{video_id}.jpg` — 같은 버킷 또는 `room-thumbnails` 별도 버킷
- [ ] `video.status` 전이 — **권장: 클라가 영상+썸네일 동시 업로드 후 `status='ready'` 직접 INSERT** (finalize Edge Function 불필요)
- [ ] `isClipVisible` 판정 위치 — 클라 로컬 계산 vs 서버 RLS view
- [ ] 인코딩 정규화 — **권장: expo-camera 옵션으로 클라 측 정규화** (C-1 §3-3)

---

## 4. 구현 체크리스트

### 4-1. `recordClip()` — S11 화면이 호출

- [ ] `expo-camera` `CameraView` ref 로 `recordAsync({ maxDuration: 3 })`.
- [ ] 결과 localUri 반환. `durationMs` = 실측 (3000 이하).
- [ ] 가로 영상 강제 — handoff §S11 "가로 강제, 세로 영상 X". `mode='video'` + `videoQuality='720p'`.
- [ ] **인코딩 정규화 (C-1 §3-3)** — `videoQuality='720p'`, `videoBitrate=2_000_000` (2Mbps),
      H.264 high profile, 30fps cap. 결과 파일 ≤ 3MB.
- [ ] 마이크 권한 거부 시 음성 자동 off fallback + 토스트 (S11 화면 책임).
- [ ] 백그라운드 전환 = 자동 중단 — viewfinder 컴포넌트 책임.
- [ ] **갤러리 진입 동선 없음** (코드 레벨에서 `expo-image-picker` import 금지).
- [ ] 하드웨어 오류 시 throw → S11 화면이 S12 alert 표시.
- [ ] 결과 사이즈 > 3MB 면 throw `Error('VIDEO_TOO_LARGE')` (인코딩 정규화 실패 케이스).

### 4-2. `uploadClip({ roomId, localUri })` — S11b 가 호출

- [ ] **썸네일 jpg 생성 (C-1 §3-4)** — `expo-video-thumbnails` `getThumbnailAsync(uri, { time: 0, quality: 0.7 })` → jpg ≤ 50KB.
- [ ] Supabase Storage `room-videos` 버킷에:
  - `{room_id}/{user_id}/{video_id}.mp4` (영상)
  - `{room_id}/{user_id}/{video_id}.jpg` (썸네일)
  - 두 개를 **병렬 업로드** (`Promise.all`).
- [ ] 두 업로드 모두 완료 후 `video` row INSERT (`status='ready'` 바로):
  ```ts
  await supabase.from('video').insert({
    id: videoId,
    room_id: roomId,
    user_id: (await supabase.auth.getUser()).data.user!.id,
    storage_path: `${roomId}/${userId}/${videoId}.mp4`,
    thumbnail_path: `${roomId}/${userId}/${videoId}.jpg`,
    duration_ms: durationMs,
    hour_slot: kstHour(),     // packages/shared timeOfDay
    status: 'ready',          // 클라 정합 (썸네일까지 다 됐을 때만 ready)
  });
  ```
- [ ] 업로드 실패 시 → 로컬 보관 (`expo-file-system` documentDirectory) + 백그라운드 자동 재시도 (S12 정책).
- [ ] 로컬 보관 기한 30일 (`POLICY.video.retentionAfterRoomEndDays` 와 별개 — 업로드 실패용 로컬 큐 자동 삭제).
- [ ] 진행률 callback 노출 (S11b ProgressBar 표시) — 영상 + 썸네일 합산 progress.
- [ ] 에러는 `logger.captureException(err, { tags: { feature: 'video-upload' }, extra: { roomId } })`.
- [ ] 반환: `{ videoId, thumbnailUrl }` (썸네일 signed URL 즉시 사용 가능하게).
- [ ] **storage upload 시 cacheControl 헤더 명시** (`cacheControl: '3600'` = 1시간).

### 4-3. `isClipVisible({ videoId, viewerId })` — S13 셀 렌더 시 호출

- [ ] viewer 본인의 `video` row 중 `created_at > now() - 24h AND room_id = ?` 1건 이상이면 visible.
- [ ] 그렇지 않으면 S13 은 ③a 블러 모드(= S10 으로 강제 라우팅).
- [ ] **합의 결과에 따라 RLS view 로 빼는 것이 RLS 정합성 ↑** — 합의 후 확정.

### 4-4. 마이그레이션 (필요 시)

- [ ] Storage 버킷 `room-videos` 생성 SQL (별도 마이그레이션 파일).
- [ ] 버킷 RLS: 같은 `room_member` 만 read, 본인만 write.
- [ ] (옵션) blur 게이트 view 추가 시 `create view public.video_visible_to(viewer_id) as ...`

---

## 5. 테스트

- **unit (vitest)**: `kstHour()` 경계 (KST 0시, 23시), retry queue 로직.
- **component (jest)**: `recordClip` 은 expo-camera mock 으로 onRecord callback 시뮬레이션.
- **integration (CI 실DB)**: `uploadClip` → row 존재 + storage HEAD 200 + RLS 본인만 SELECT.
- **e2e-realdb** (push 전 필수): 실 Supabase 에 e2e 유저로 촬영 mock UPLOAD → S13 화면에 모자이크 표시 → 24h 경과 시 블러 재적용까지 관통.

---

## 6. 발생 이벤트 (PostHog)

`lib/analytics-taxonomy.ts` 의 상수만 사용 (raw 문자열 금지):

- `S11:video_capture_entered` — `recordClip` 진입 시.
- `S12:capture_failure_alert_shown` — 업로드/하드웨어 실패 시.

---

## 7. 위험·예외

- iOS 권한 거부 후 재요청 막힘 → `openSystemSettings()` 로 유도 (S11a 화면 책임).
- 안드로이드 메모리 부족 → S12 hardware alert.
- 네트워크 끊김 → 로컬 큐 + 백그라운드 재시도, 성공 시 알림 X (조용히, D8 정책).
- 방 종료 후 업로드 시도 → `room.status != 'active'` 면 reject + 토스트.

---

## 8. 완료 정의 (DoD)

- [ ] `pnpm -F mobile exec tsc --noEmit` 통과.
- [ ] `pnpm -F mobile lint` 통과 (ds-enforce 포함).
- [ ] 3 함수 모두 throw 제거, 정상 동작.
- [ ] unit + component + integration 테스트 통과.
- [ ] e2e-realdb 시나리오 1개 이상 통과.
- [ ] A 1차 리뷰 OK.

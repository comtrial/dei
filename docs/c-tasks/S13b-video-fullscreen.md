# S13b · 영상 풀스크린 재생

- **status**: done
- **owner**: C (손승태)
- **priority**: P2
- **route**: `apps/mobile/app/(app)/room/[roomId]/video/[videoId].tsx`
- **선행**: S13 (셀 본체 탭 진입원), C-0 영상 모듈 (signed URL), **C-1 영상 서빙 최적화 (poster + prefetch)**

---

## 1. 목적 / 진입·이탈

S13 셀 본체 탭 → 진입. 한 멤버의 3초 영상을 풀스크린에서 자세히. 영상이 짧으므로
**자동 루프 재생**. 보고 닫고 빠르게 다음으로.

| | |
|---|---|
| **진입** | S13 셀 본체 탭 |
| **이탈** | 닫기(×) → S13 / 좌·우 swipe → 같은 시간대 다른 멤버 영상 / 멤버 칩 탭 → S14 / 차단 멤버 영상 = 진입 차단 |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `FullscreenVideo` — 절대 inset 0 비디오 영역, 자동 루프.
- `ProgressBar` — 상단 3px 트랙 + white fill (재생 진행).
- `Chip` + `Avatar` — 우상단 멤버 칩 (탭 = S14 프로필).
- `IconButton` — 좌상단 닫기 × · 일시정지 인디케이터.
- `Text` — swipe 힌트 "‹ 다른 멤버 영상 ›".
- `StateView` — 영상 fetch 실패 + 재시도.

---

## 3. 의존 데이터

- `video` (videoId 로 fetch) — `member_id`, `room_id`, `storage_path`, `created_at`.
- `room_member` — 멤버 칩 닉네임/아바타/타임스탬프.
- `block` — 차단 멤버 영상 진입 차단 (양방향).
- 같은 시간대 다른 영상 — `WHERE room_id=? AND hour_slot=?` 로 sibling 목록.

Storage signed URL: `supabase.storage.from('room-videos').createSignedUrl(storage_path, 60)`.

---

## 4. 구현 체크리스트

### 4-1. 진입 가드
- [x] videoId param 으로 `video` row fetch.
- [x] member_id 가 본인 `block` 관계 있는지 확인 → 있으면 즉시 `router.back()` + 토스트.
- [x] storage signed URL 생성 → `FullscreenVideo` source 로.

### 4-2. 자동 루프 재생 + **poster** (C-1 §4-2)
- [x] `expo-video` `useVideoPlayer({ uri, poster: thumbnailUrl })` 또는 `<VideoView posterSource={...} />`.
- [x] **poster** = S13 grid 에서 받은 동일한 썸네일 jpg → 로드 전·로드 중 검은 화면 0건.
- [x] `shouldLoop=true`, `isMuted` default true.
- [ ] 가로 영상 (letterbox or 자동 가로 회전 — DS 결정).
- [x] `bufferOptions.preferredForwardBufferDuration: 1` (1초만 미리, C-1 §4-3).
- [x] `ProgressBar` 상단 — `playbackStatus.positionMillis / durationMillis` 매핑.

### 4-3. 좌·우 swipe (같은 시간대 다른 멤버) + **prefetch** (C-1 §4-4)
- [x] 진입 시 같은 hour_slot 의 sibling video 목록 prefetch.
- [x] **현재 + 1 (다음 swipe 후보) 만 적극 prefetch** — 전부 prefetch 시 데이터 폭증:
  - `expo-image` `Image.prefetch([thumbnailUrl_next])` (썸네일).
  - `expo-video` 직전·직후 player 인스턴스 미리 생성 (poster 표시 + 첫 1초만 fetch).
- [x] PanResponder 또는 `react-native-pager-view` 로 좌·우 swipe.
- [x] 양 끝 = bounce 후 stop (관례).
- [ ] 시간대 이동은 여기 X — S13 timestrip 에서만.
- [ ] swipe 후 새 video 의 첫 frame ≤ 400ms (prefetch 효과 측정).

### 4-4. 영상 영역 탭 / 길게 누르기 (Reels 패턴)
- [x] 단일 탭 = 일시 정지 토글 + 일시정지 인디케이터 표시.
- [x] 길게 누르기 = 일시 정지 + UI 숨김 (×, 멤버 칩, ProgressBar 모두 숨김).
- [x] 손 떼면 UI 복귀 + 재생.

### 4-5. 닫기 / 멤버 칩
- [x] 좌상단 × → `router.back()` (S13 으로).
- [x] 우상단 멤버 칩 (Chip + Avatar) 탭 → `/(app)/room/[roomId]/members?userId=...` (S14).

### 4-6. fetch 실패
- [x] storage signed URL 실패 → `StateView` "영상을 불러오지 못했어요" + 재시도 버튼.
- [x] `logger.captureException`.

---

## 5. 컴포넌트 명세 (handoff.html S13b)

```
[ ] 영상 재생 영역 (전체화면, 자동 루프, 무음 기본) — 가로 영상
[ ] 닫기 버튼 (좌상단) → S13
[ ] 멤버 정보 칩 (우상단) — 아바타 + 닉네임 + 업로드 시간 (탭 = S14)
[ ] 재생 progress 바 (상단)
[ ] 일시 정지 인디케이터 (탭 시 표시) (조건부)
[ ] swipe 힌트 — "‹ 다른 멤버 영상 ›"
[ ] 상태바
```

---

## 6. 정책 (L2)

- 휘발성 정책 — 편집·다운로드·공유 X.
- PRD §9 차단 멤버 영상 진입 불가 (양방향 숨김).
- S13 timestrip 시간대 ↔ 풀스크린 멤버 매핑.

---

## 7. 발생 이벤트

없음.

---

## 8. 테스트

- **component**: 차단 멤버 video 진입 → router.back 호출.
- **component**: 자동 루프 + ProgressBar 동기화.
- **component**: 좌·우 swipe → sibling video 로 전환.
- **component**: 멤버 칩 탭 → S14 push.
- **integration**: signed URL 생성 + storage HEAD 200.
- **performance**: 풀스크린 진입 → 첫 frame ≤ 800ms / swipe → 다음 첫 frame ≤ 400ms (C-1 §7).

---

## 9. 완료 정의

- [x] tsc + lint 통과.
- [x] component test 통과.
- [ ] 실기에서 셀 탭 → 풀스크린 자동 루프 + swipe 수동 확인.

---

## 10. 와이어프레임

`all-screens.html` S13b (line 2527~) · `handoff.html` S13b

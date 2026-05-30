# S11 · 3초 영상 촬영

- **status**: pending
- **owner**: C (손승태)
- **priority**: P1
- **route**: `apps/mobile/app/(app)/room/[roomId]/upload.tsx`
- **선행**: C-0 영상 모듈 (`recordClip`), S11a 카메라 권한

---

## 1. 목적 / 진입·이탈

PRD §4 핵심 메커니즘 — 최대 3초 일상 영상. dei 의 가장 자주 쓰는 화면.

| | |
|---|---|
| **진입** | S10 촬영 CTA / S13 셀 탭 / 시간별 푸시 알림 |
| **이탈** | 셔터 완료 → S11b (미리보기) / 닫기(×) → 직전 화면 / 권한 거부 → S11a / 하드웨어 실패 → S12 alert |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `StateView` — Fullscreen Viewfinder 플레이스홀더 (있다면). 없으면 직접 `expo-camera` `CameraView` 배치 + 위에 overlay.
- `IconButton` — 닫기 × (좌상단) · 카메라 flip (우상단). Floating overlay 컨트롤.
- `ProgressBar` — 녹화 3초 세그먼트 인디케이터 (상단).
- `PulseRing` — 셔터 버튼 88px 흰 원 + accent.
- `Toggle` — 음성 마이크 on/off pill (하단).
- `Text` — 셔터 힌트 "길게 눌러서 녹화 · 최대 3초".

> 만약 `@dei/ui` 에 viewfinder overlay 가 부족하면 A 에게 패턴 추가 요청 — raw 스타일 금지.

---

## 3. 의존 모듈

- `lib/video.stub.ts` → `recordClip()` (C-0).
- `lib/permissions.ts` → 마운트 시 camera 권한 재확인. denied 면 `router.replace('/(app)/permission/camera')`.
- `expo-camera` `CameraView` ref → `recordAsync({ maxDuration: 3 })`.

---

## 4. 구현 체크리스트

### 4-1. 권한 게이트
- [ ] 마운트 시 `getPermissionState('camera')` 호출.
  - granted → 그대로 viewfinder 초기화.
  - denied / undetermined → S11a 로 replace.
- [ ] 마이크 권한은 음성 토글 ON 누를 때만 요청. 거부 시 무음 fallback + toast.

### 4-2. Viewfinder
- [ ] `expo-camera` `CameraView` ref. `mode='video'`, `facing` state ('front'/'back').
- [ ] **가로(landscape) 강제** — 폰이 세로여도 viewfinder 는 가로 frame (handoff §S11). `videoQuality='720p'` 등으로 가로 비율 고정.
- [ ] 백그라운드 전환 시 녹화 자동 중단 + 재진입 시 재초기화 (`AppState` listener).

### 4-3. 셔터 (PulseRing)
- [ ] **길게 누르기로 녹화 시작** — `onPressIn` → `recordAsync({ maxDuration: 3 })`.
- [ ] 누르고 있는 동안 `ProgressBar` 3초 채움 애니메이션.
- [ ] `onPressOut` 이전에 3초 도달 → 자동 stop.
- [ ] `onPressOut` 직전 stop 도 OK (최소 길이 제한 없음).
- [ ] 결과 `{ uri, duration }` → S11b 로 `router.push({ pathname: '...upload-preview', params: { localUri, durationMs, roomId } })`.

### 4-4. 카메라 flip / 음성 토글
- [ ] flip 버튼 → `facing` toggle.
- [ ] 음성 토글 default OFF. 클릭 시 마이크 권한 → 결과에 따라 표시 갱신.

### 4-5. 닫기 / 실패
- [ ] 닫기 × → `router.back()`.
- [ ] `recordAsync` reject → S12 alert (`hardware_error` 분기) 표시.

---

## 5. 컴포넌트 명세 (handoff.html S11)

```
[ ] 카메라 viewfinder (가로 강제)
[ ] 닫기 버튼 (좌상단)
[ ] 카메라 flip 버튼 (우상단)
[ ] 녹화 progress 인디케이터 (3초 시각화)
[ ] 셔터 버튼 (중앙 하단, PulseRing)
[ ] 셔터 힌트 — "길게 눌러서 녹화 · 최대 3초"
[ ] 음성 토글 (마이크 on/off) — 기본 off
[ ] 상태바
```

---

## 6. 정책 (L2 / POLICY)

- 녹화 최대 3초 / 최소 길이 제한 없음.
- 음성 무음 기본 (`POLICY.video` 직접 상수 없음 — 화면 결정).
- **갤러리 X · 현장 카메라만** — `POLICY.video.cameraOnlyNoGallery=true`. 코드에서 `expo-image-picker` 사용 금지.
- 데드라인 배지 제거 (PRD §8).

---

## 7. 발생 이벤트

- `lib/analytics-taxonomy.ts` 상수: `S11:video_capture_entered` — 화면 mount 시.

---

## 8. 테스트

- **component (jest)**: 마운트 시 권한 'denied' 면 router.replace 호출.
- **component**: 셔터 onPressIn → `recordClip` mock 호출.
- **component**: 3초 도달 시 자동 stop + S11b 로 push.
- **e2e-native (Maestro)**: 실기 카메라 권한 granted 상태 → 셔터 누르고 3초 → S11b 화면 표시.

---

## 9. 완료 정의

- [ ] tsc + lint 통과.
- [ ] component test 통과.
- [ ] 실기 녹화 → S11b 전이 수동 확인.
- [ ] S04b 프로필 사진 카메라 모듈 재사용 가능한지 B 와 인터페이스 확인 (recordPhoto 분리 필요 시).

---

## 10. 와이어프레임

`all-screens.html` S11 (line 2111~) · `handoff.html` S11

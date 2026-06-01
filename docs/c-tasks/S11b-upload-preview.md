# S11b · 촬영 미리보기

- **status**: done
- **owner**: C (손승태)
- **priority**: P1
- **route**: `apps/mobile/app/(app)/room/[roomId]/upload-preview.tsx`
- **선행**: C-0 영상 모듈 (`uploadClip`), S11

---

## 1. 목적 / 진입·이탈

방금 촬영한 3초 영상 업로드 전 확인. 잘못 올리기 방지 + 재촬영 1번 더 기회.
BeReal/Locket 패턴.

| | |
|---|---|
| **진입** | S11 셔터 완료 후 `router.push` (params: `localUri`, `durationMs`, `roomId`) |
| **이탈** | "다시 찍기" → S11 / "올리기" → uploadClip → 직전 화면(S10/S13) / 닫기(폐기 confirm) → 직전 화면 / 업로드 실패 → S12 alert |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `FullscreenVideo` — 자동 루프 영상 미리보기.
- `IconButton` — 좌상단 원형 닫기 ×.
- `Badge` — 녹화 길이 배지 '● 2.3초' (상단 중앙).
- `Button` — secondary '다시 찍기' / primary '올리기' (비대칭 2-CTA).
- `BottomActionBar` — 나란히 2-CTA 바.
- `AlertDialog` — 영상 폐기 confirm "영상이 사라져요. 정말 닫을까요?".
- `ProgressBar` — 업로드 진행률.
- `Spinner` — 업로드 오버레이.

---

## 3. 의존 모듈

- `lib/video.stub.ts` → `uploadClip({ roomId, localUri })` (C-0).
- `expo-av` `Video` — FullscreenVideo 내부에서 사용한다면.

---

## 4. 구현 체크리스트

### 4-1. 자동 루프 재생
- [x] params 의 `localUri` 를 `FullscreenVideo` 로 자동 루프 재생 (`shouldLoop=true`, muted=false).
- [x] 가로 영상 — letterbox 또는 자동 가로 회전 (DS 결정).

### 4-2. 2-CTA
- [x] "다시 찍기" → `router.back()` (S11 로 복귀, 로컬 영상 폐기 필요시 cleanup).
- [x] "올리기" → uploadClip 호출:
  ```ts
  const { videoId } = await uploadClip({ roomId, localUri });
  router.replace(`/(app)/room/${roomId}`); // S13 로
  ```
- [x] 업로드 진행 중 UI disable + `ProgressBar` 표시 (uploadClip 의 progress callback 노출 필요 — C-0 설계 시 고려).
- [x] 업로드 성공 시 → `S13` 으로 replace (자동 ③b 언블러 전환).
- [x] 업로드 실패 시 → S12 alert (`upload_failed` 분기) 표시.

### 4-3. 닫기 폐기 confirm
- [x] 좌상단 × 탭 → `AlertDialog` "영상이 사라져요. 정말 닫을까요?".
- [x] 확인 → 영상 폐기 + `router.back()`.
- [x] 취소 → confirm 닫기.

### 4-4. 길이 배지
- [x] params `durationMs` 를 `Badge` 에 표시: `● {(durationMs/1000).toFixed(1)}초`.

---

## 5. 컴포넌트 명세 (handoff.html S11b)

```
[ ] 영상 재생 영역 (자동 루프) — 가로 영상
[ ] 닫기 버튼 (좌상단) → 폐기 confirm
[ ] 녹화 길이 배지 (상단 중앙) — "● 2.3초"
[ ] CTA — "다시 찍기" (secondary)
[ ] CTA — "올리기" (primary)
[ ] 닫기 confirm — "영상이 사라져요. 정말 닫을까요?" (조건부)
[ ] 업로드 progress 표시 (조건부)
[ ] 업로드 Spinner 오버레이 (조건부)
[ ] 상태바
```

---

## 6. 정책 (L2)

- 편집 기능 MVP 제외 — 자르기/필터/텍스트 X (날것 정신).
- 닫기 시 영상 폐기 confirm 강제.
- 업로드 진행 중 UI disable.

---

## 7. 발생 이벤트

없음. (S11b 단독 이벤트 X — S12 가 실패만 추적)

---

## 8. 테스트

- **component**: localUri 받으면 FullscreenVideo 렌더.
- **component**: "올리기" 탭 → uploadClip mock 호출 → 성공 시 router.replace 호출.
- **component**: 닫기 × → AlertDialog 표시 → 확인 시 폐기.
- **integration (CI 실DB)**: e2e 유저로 uploadClip 호출 → `video` row 존재 확인.

---

## 9. 완료 정의

- [x] tsc + lint 통과.
- [x] component test 통과.
- [ ] 실기 업로드 성공 → S13 모자이크에 본인 영상 표시 수동 확인.
- [ ] 네트워크 끊김 시 S12 alert 진입 확인.

---

## 10. 와이어프레임

`all-screens.html` S11b (line 2176~) · `handoff.html` S11b

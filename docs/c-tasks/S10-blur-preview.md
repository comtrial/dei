# S10 · blur 미리보기 (매칭 후 첫 진입)

- **status**: done
- **owner**: C (손승태)
- **priority**: P1
- **route**: `apps/mobile/app/(app)/room/[roomId]/preview.tsx`
- **선행**: C-0 영상 모듈, S11 (촬영 CTA 진입), A 의 splash 라우팅 부트스트랩 (B-0b)

---

## 1. 목적 / 진입·이탈

매칭 성사 푸시 → splash → 이 화면 직행. 매칭 ceremony(환영 카피) + 블러 게이트(눈팅 방지)
+ 첫 영상 유도를 한 화면에 통합. 이 화면 = "바뀐 홈"(매칭 후 홈 = 방, ③a 블러 모드).
영상 올리면 S13 언블러 모드(③b)로 전환.

| | |
|---|---|
| **진입** | S01 (매칭 후 라우팅, 본인 영상 없음/24h 경과) / 24h 경과 시 S13 → 자동 전환 |
| **이탈** | 촬영 CTA → S11 / 영상 업로드 후 → S13 자동 replace |

**뒤로가기 없음** — 방 이미 입장 상태. 이탈은 명시적(S13 ⋯ → S16) 만.

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `Text`
- `TopNav` — 방 식별 "잠긴 방 미리보기" (back 숨김).
- `BrandTransitionFrame` — 매칭 ceremony 환영 헤딩 (있다면).
- `GridRoom` — 2열 멤버 블러 미리보기 그리드, 9/16 카드.
- `Badge` — Lock pill 잠금 라벨 / NicknameChip 닉네임.
- `Button` — 촬영 CTA '내 영상 올리고 잠금해제'.
- `BottomActionBar` — 메인 액션 영역.
- `AlertDialog` — 메타 fetch 실패 재시도.

---

## 3. 의존 데이터

- `room` (roomId 로 fetch) — 방 식별, status.
- `room_member` — N명 멤버 목록 (닉네임).
- `video` — 멤버별 일상 영상 썸네일 (블러 처리된 thumbnail_path).
- 본인 `video` 중 `room_id=? AND created_at > now()-24h` 가 1건 이상이면 → S13 으로 자동 replace (블러 게이트 통과).

`isClipVisible({ videoId, viewerId })` (C-0) 사용 가능하지만, 이 화면은 본인 영상 존재 여부만 보면 됨 (간단 쿼리).

---

## 4. 구현 체크리스트

### 4-1. 마운트 시 블러 게이트 평가
- [ ] roomId param 으로 본인의 24h 내 `video` row count 조회.
  - 1개 이상 → `router.replace('/(app)/room/' + roomId)` (S13 으로).
  - 0 개 → 이 화면 본문 표시 (블러 미리보기).

### 4-2. 멤버 메타 fetch
- [ ] `room_member` JOIN `profile` 로 N명 닉네임 + thumbnail 가져옴.
- [ ] fetch 실패 시 `AlertDialog` "다시 시도" + 캐시된 닉네임은 노출 (있으면).
- [ ] `logger.captureException` 로 보고.

### 4-3. 환영 카피 분기
- [ ] 매칭 후 첫 진입 → "{N}명과 새 방에 모였어요! 🎉"
- [ ] 24h 경과 후 재진입 (영상 만료) → "오랜만이에요! 영상 한 번 올려주세요"
- [ ] 분기 기준: `room_member.joined_at` 와 본인 `video` 의 마지막 created_at 비교.

### 4-4. GridRoom (블러 모드)
- [ ] `GridRoom` 컴포넌트의 blur mode prop 사용 (없으면 A 에게 추가 요청).
- [ ] N명 멤버 카드 (닉네임 + 흐린 영상 thumbnail + 🔒 락 아이콘).

### 4-5. 촬영 CTA
- [ ] Button "내 영상 올리고 잠금해제" 탭 → `getPermissionState('camera')`:
  - granted → `router.push('/(app)/room/' + roomId + '/upload')` (S11).
  - denied/undetermined → `router.push('/(app)/permission/camera')` (S11a).

---

## 5. 컴포넌트 명세 (handoff.html S10)

```
[ ] 방 식별 표시 — "잠긴 방 미리보기"
[ ] "바뀐 홈" 시각 시그널 (DS 영역)
[ ] 환영 헤딩 — 분기 카피
[ ] 설명 카피 — "3초 영상으로 인사하면 친구들 하루도 보여요"
[ ] 블러 게이트 표시 (자물쇠 라벨)
[ ] 멤버 블러 미리보기 (N명, 닉네임 + 흐린 일상)
[ ] 메타 fetch 실패 alert (조건부)
[ ] 촬영 CTA (메인 액션) — "내 영상 올리고 잠금해제"
[ ] 상태바
```

---

## 6. 정책 (L2)

- `POLICY.blurGate.visibilityWindowHours` = 24 (SSOT).
- 데드라인 타이머 없음 (PRD §8).
- 뒤로가기 없음.

---

## 7. 발생 이벤트

- `S4:room_preview_entered_blurred` — 화면 mount 시.
- `S5:blur_reapplied_24h_passed` — 24h 경과 후 재진입 분기일 때.

---

## 8. 테스트

- **component**: 본인 24h 내 영상 1개 있는 상태 → router.replace 호출 (이 화면 안 보임).
- **component**: 본인 영상 0개 → 본문 + N명 grid 렌더.
- **component**: 촬영 CTA 권한 granted → S11 으로 push.
- **component**: 촬영 CTA 권한 denied → S11a 로 push.
- **integration (CI 실DB)**: e2e 유저 매칭 mock → 이 화면 진입 → 멤버 N명 닉네임 fetch.

---

## 9. 완료 정의

- [x] tsc + lint 통과.
- [x] component test 4 케이스 통과.
- [ ] 매칭 푸시 mock → splash → S10 직행 흐름 수동 확인.

---

## 10. 와이어프레임

`all-screens.html` S10 (line 1982~) · `handoff.html` S10

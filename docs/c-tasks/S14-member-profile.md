# S14 · 멤버 프로필

- **status**: pending
- **owner**: C (손승태)
- **priority**: P2
- **route**: `apps/mobile/app/(app)/room/[roomId]/members.tsx` (단일 멤버 = query `?userId=...`)
- **선행**: S13 (셀 아바타 탭 진입원), B 의 S15 차단·신고 시트 (`/(app)/report/block-report`)

---

## 1. 목적 / 진입·이탈

S13(방) 셀 아바타 탭 / S13b(풀스크린) 멤버 칩 탭 / S13a(채팅) 메시지 아바타 탭 → 진입.
같은 방 멤버의 프로필 정보 + 차단·신고 진입점.

PRD §7 "프로필 상세 MVP 최소만" — 단순 정보 카드. 키·직업·관심사·"상대 팀" 모두 제거.

| | |
|---|---|
| **진입** | S13/S13b/S13a 의 아바타 탭 |
| **이탈** | 뒤로 → S13 / ⋯ 메뉴 → S15 (B 담당 차단·신고 시트) / 자동 퇴장 멤버 진입 시 안내 후 자동 S13 복귀 |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `TopNav` — back ‹ + more ⋯ (탭 = S15 시트).
- `Avatar` (HeroAvatar) — 120px 원형 이니셜/사진.
- `Text` — 닉네임 / 나이·성별 메타.
- `Card` (InfoRows) — key/value row + bg-2 BioCard.
- `BottomSheet` (S15 entry) — 차단·신고 단일 진입 (B 가 만든 화면으로 라우팅).
- `AlertDialog` — 프로필 fetch 실패 재시도.
- `ProfileHero` — DS pattern. 아바타 + 닉네임 + 메타 묶음. **이미 존재 — 활용**.

---

## 3. 의존 데이터

- `profile` (member_id 로 fetch) — 닉네임, 나이(생년월일), 성별, 한 줄 자기소개, MBTI, 지역.
  - **S04 입력 데이터 기준**. 옛 키·직업·관심사 태그 모두 제거.
- `room_member` (room_id + user_id) — `status` 확인 → 'left'/'auto_kicked' 이면 진입 차단.

---

## 4. 구현 체크리스트

### 4-1. 진입 가드
- [ ] query `userId` param.
- [ ] `room_member` status 조회 → 'left'/'auto_kicked' 이면 `AlertDialog` "방을 나간 친구예요" → 확인 시 router.back.
- [ ] `profile` fetch — 실패 시 `AlertDialog` "다시 시도".

### 4-2. ProfileHero
- [ ] HeroAvatar (120px) — `profile.avatar_url` 있으면 이미지, 없으면 닉네임 첫 글자.
- [ ] 닉네임 + "{age}세 · {gender}" 메타.
- [ ] 한 줄 자기소개 (BioCard, bg-2).

### 4-3. InfoRows
- [ ] MBTI 정보 (비어있으면 row 숨김).
- [ ] 지역 정보 (비어있으면 row 숨김).
- [ ] 선택 필드 빈 값은 row 자체 X.

### 4-4. TopNav
- [ ] back ‹ → `router.back()`.
- [ ] more ⋯ → S15 `/(app)/report/block-report?targetId=...&roomId=...` 로 push (B 가 만든 화면).

---

## 5. 컴포넌트 명세 (handoff.html S14)

```
[ ] 뒤로가기 버튼 (좌상단)
[ ] ⋯ 메뉴 (우상단) → S15 차단·신고 시트
[ ] 프로필 사진 (없으면 닉네임 첫 글자)
[ ] 닉네임
[ ] 나이·성별 메타 — "24세 · 여성"
[ ] 한 줄 자기소개 (비어있으면 row 숨김)
[ ] MBTI 정보 (비어있으면 row 숨김)
[ ] 지역 정보 (비어있으면 row 숨김)
[ ] 프로필 fetch 실패 alert (조건부)
[ ] "방을 나간 친구예요" 안내 (자동 퇴장 멤버) (조건부)
[ ] 상태바
```

---

## 6. 정책 (L2)

- PRD §7 프로필 상세 MVP 최소 정보 (키/직업/관심사 제거).
- 차단·신고 무알림·조회기록 미저장 (F22).
- 선택 필드 빈 값 row 숨김.
- 우리/상대 팀 구분 표시 X.

---

## 7. 발생 이벤트

- `S7:profile_overflow_menu_opened` — ⋯ 메뉴 탭 시 (실제 상수명은 `lib/analytics-taxonomy.ts` `room_overflow_menu_opened` = 'S7:profile_overflow_menu_opened').

---

## 8. 테스트

- **component**: 프로필 데이터 mock → ProfileHero + InfoRows 렌더링.
- **component**: MBTI/지역 빈 값 → row 숨김.
- **component**: room_member status='left' → AlertDialog 표시 + router.back.
- **component**: ⋯ 탭 → S15 route 로 push (param 정확).
- **integration (CI 실DB)**: e2e 유저 2명 같은 방 → S14 진입 → profile fetch 성공.

---

## 9. 완료 정의

- [ ] tsc + lint 통과.
- [ ] component test 통과.
- [ ] 실기에서 S13 아바타 탭 → S14 진입 수동 확인.
- [ ] B 의 S15 시트 entry 정합 확인 (route param 명세 합의).

---

## 10. 와이어프레임

`all-screens.html` S14 (line 2592~) · `handoff.html` S14

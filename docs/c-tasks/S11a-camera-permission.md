# S11a · 카메라 권한 필요 안내

- **status**: pending
- **owner**: C (손승태)
- **priority**: P1
- **route**: `apps/mobile/app/(app)/permission/camera.tsx`
- **선행**: 없음 (가장 가벼움 — S07a 알림 권한 패턴 그대로)

---

## 1. 목적 / 진입·이탈

영상 촬영(S11) 진입 시 **카메라 권한 거부** 상태로 차단된 사용자에게 안내.
dei 모든 영상이 카메라 의존이므로 권한 없으면 핵심 기능 불가.

| | |
|---|---|
| **진입** | S10/S13 촬영 CTA 시 권한 = 'denied' |
| **이탈** | "설정에서 카메라 켜기" → OS 시스템 설정 (켜고 복귀 시 S11 자동 진행) / "나중에 하기" → 직전 화면 |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `PermissionGate` (pattern) — S07a 알림 권한과 동일 레이아웃 재사용. **이미 존재.**
- `Text` — 헤딩/설명 센터 위계
- `IconButton` — 우상단 원형 닫기 ×
- `Card` (bg-2) — "왜 필요한가요?" info 박스, 좌측정렬 불릿
- `Button` — primary "설정에서 카메라 켜기" / secondary "나중에 하기" (세로 2-CTA)

---

## 3. 의존 모듈

- `apps/mobile/lib/permissions.ts` — `getPermissionState('camera')`, `requestPermission('camera')`, `openSystemSettings()` 이미 구현됨.
- 정책: `POLICY.video.cameraOnlyNoGallery=true` (참조용).

---

## 4. 구현 체크리스트

- [ ] 마운트 시 `getPermissionState('camera')` 호출 → 'granted' 이면 즉시 `router.back()` (이 화면 안 보일 것).
- [ ] 'undetermined' 이면 `requestPermission('camera')` 자동 호출 (OS 다이얼로그) → 결과에 따라 분기:
  - granted → `router.back()` + S11 으로 (직전 화면이 S10/S13 이면 그대로 복귀).
  - denied → 이 화면 본문 표시 (게이트 안내 UI).
- [ ] "설정에서 카메라 켜기" 탭 → `openSystemSettings()`.
- [ ] "나중에 하기" 탭 → `router.back()`.
- [ ] 화면 포커스 복귀 시 (`useFocusEffect`) 권한 재조회 → granted 면 자동 진행.
- [ ] 우상단 × 탭 → `router.back()`.
- [ ] `PermissionGate` 의 props 가 부족하면 A 에게 추가 요청 (자체 스타일링 금지).

---

## 5. 컴포넌트 명세 (handoff.html S11a 그대로)

```
[ ] 닫기 버튼 (우상단) → 직전 화면(S10/S14)으로
[ ] 아이콘 (카메라 — 원형 배지)
[ ] 헤딩 — "카메라 권한이 필요해요"
[ ] 설명 — "3초 일상 영상을 찍으려면 카메라 권한이 필요해요. 설정에서 허용해주세요."
[ ] "왜 필요한가요?" 박스 (bg-2 좌측정렬 불릿):
    · 3초 영상으로 내 하루 기록
    · 친구들 일상도 보려면 영상 1개 필요
    · 방의 모든 활동이 영상 기반
[ ] CTA 1 (primary) — "설정에서 카메라 켜기"
[ ] CTA 2 (secondary) — "나중에 하기"
[ ] 상태바
```

---

## 6. 정책 의존 (L2)

- 카메라 권한 거부는 항상 별도 화면 (S07a 동일 패턴).
- 재진입 시 매번 안내 (쿨다운 없음 — 권한 없으면 영상 불가가 본질).
- 마이크 권한 별도 처리 (음성 기본 off, 켤 때만 OS 다이얼로그) — 이 화면 책임 아님.

---

## 7. 발생 이벤트

없음. (이 화면 단독 이벤트 X)

---

## 8. 테스트

- **component**: PermissionState='denied' 일 때 UI 렌더 확인.
- **component**: 우상단 × 누르면 router.back 호출.
- **component**: "설정에서 카메라 켜기" 누르면 `openSystemSettings()` 호출.
- **e2e-native (Maestro)**: 권한 거부 상태에서 S11 진입 시도 → 이 화면 표시.

---

## 9. 완료 정의

- [ ] `pnpm -F mobile exec tsc --noEmit` 통과.
- [ ] `pnpm -F mobile lint` 통과.
- [ ] component test 통과.
- [ ] 실기기 권한 거부 후 자동 진행 흐름 수동 확인.

---

## 10. 와이어프레임

`/Users/sonseungtae/Documents/all-screens.html` S11a (line 2046~)
`/Users/sonseungtae/Documents/handoff.html` S11a

# S12 · 촬영 실패 차등 alert (2종)

- **status**: done
- **owner**: C (손승태)
- **priority**: P2
- **route**: `apps/mobile/app/(app)/room/[roomId]/capture-failed.tsx`
- **선행**: S11, S11b (실패 케이스 발생원)

---

## 1. 목적 / 진입·이탈

S11 촬영 중 발생하는 **2종 실패** 차등 alert. 권한 거부는 S11a 로 분리되어 이 화면 미포함.

| 케이스 | 차등 |
|---|---|
| **하드웨어 오류** | 카메라 점유·결함. "다른 앱 종료 후 재시도". danger 보더. |
| **업로드 실패** | 네트워크. "영상은 저장됐어요. 연결되면 자동 업로드". info 보더. |

| | |
|---|---|
| **진입** | S11 `recordClip` reject (hardware) / S11b `uploadClip` reject (upload) |
| **이탈** | 다시 시도 → S11 / 취소(확인) → 직전 화면 / 백그라운드 자동 재시도 (업로드만, 무알림) |

---

## 2. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `Text`
- `AlertDialog` — mini alert 카드 형태. 상단 컬러 보더로 심각도 구분 (danger/info).
- `Badge` — eyebrow 카테고리 라벨 ("하드웨어 오류" / "업로드 실패").
- `Button` — 2-CTA `ButtonRow` primary/secondary 균등 분할.

---

## 3. 구현 체크리스트

### 3-1. 라우팅 / 분기
- [x] 이 화면은 보통 **modal/route param** 으로 진입 — query param `reason=hardware|upload` 받는다.
- [x] 또는 S11/S11b 안에서 `AlertDialog` 인라인 렌더 — DS `AlertDialog` 가 modal 지원하면 인라인이 더 자연스러움. **선택**: 라우트 분리 (별도 화면) vs 인라인 modal. 핸드오프 가이드는 별도 route 로 만들었으므로 그대로 유지.

### 3-2. 하드웨어 오류 alert
- [x] 헤딩 — "카메라를 사용할 수 없어요"
- [x] 설명 — "다른 앱이 카메라를 점유 중이거나 기기 문제일 수 있어요."
- [x] CTA: secondary "취소" / primary "다시 시도" → S11 으로 router.replace.
- [x] 상단 danger 보더 (DS 토큰).

### 3-3. 업로드 실패 alert
- [x] 헤딩 — "네트워크가 약해요"
- [x] 설명 — "영상은 저장됐어요. 연결되면 자동으로 올려드려요."
- [x] CTA: secondary "확인" → router.back / primary "지금 재시도" → `uploadClip` 재호출.
- [x] 상단 info 보더.

### 3-4. 백그라운드 자동 재시도
- [x] `uploadClip` 자체에 retry queue 있음 (C-0 구현). 이 화면은 그저 첫 알림.
- [x] 재시도 성공 시 알림 X (조용히 — D8 정책).

---

## 4. 컴포넌트 명세 (handoff.html S12)

```
[ ] 하드웨어 오류 alert
    - eyebrow Badge "하드웨어 오류"
    - 헤딩 "카메라를 사용할 수 없어요"
    - 설명
    - 2-CTA "취소" / "다시 시도"
    - 상단 danger 보더
[ ] 업로드 실패 alert
    - eyebrow Badge "업로드 실패"
    - 헤딩 "네트워크가 약해요"
    - 설명 + "영상은 저장됐어요"
    - 2-CTA "확인" / "지금 재시도"
    - 상단 info 보더
[ ] 상태바
```

---

## 5. 정책 (L2)

- 로컬 영상 보관 기한 30일 — `POLICY.video.retentionAfterRoomEndDays` 와 별개 로컬 큐.
- 백그라운드 자동 재시도 (네트워크 복구 트리거).
- alert 톤 비난·재촉 금지.
- 영상 손상·길이 초과 등 기타 케이스 = 업로드 실패 alert 로 통합.

---

## 6. 발생 이벤트

- `S12:capture_failure_alert_shown` — alert 표시 시 (분기는 extra 로 `{ reason: 'hardware'|'upload' }`).

---

## 7. 테스트

- **component**: param `reason='hardware'` → 헤딩 매칭.
- **component**: param `reason='upload'` → 헤딩 매칭.
- **component**: "다시 시도" 탭 → S11 으로 router.replace.

---

## 8. 완료 정의

- [x] tsc + lint 통과.
- [x] component test 통과 (2 분기).
- [ ] 실기에서 강제 네트워크 OFF → 업로드 실패 alert 표시 확인. ← 수동 검증 필요

---

## 9. 와이어프레임

`all-screens.html` S12 (line 2236~) · `handoff.html` S12

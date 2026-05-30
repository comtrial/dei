# C (손승태) 작업 인덱스 — 영상·방

> dei 묶음3(촬영) + 묶음4(방) 화면 8장 + 영상 stub(C-0) + realtime/presence
> stub(C-0b) + 서버 L1(영상 파이프라인 / 방 라이프사이클) 전부 한 곳에서 관리.
> 추후 agent 에게 작업 시킬 때 **이 폴더의 task .md 1개씩** 전달.

레퍼런스 (단일 SSOT):
- 와이어프레임 — `/Users/sonseungtae/Documents/all-screens.html`
- 컴포넌트 명세 — `/Users/sonseungtae/Documents/handoff.html`
- 핸드오프 가이드 — 채팅으로 받은 "dei 개발팀 핸드오프 가이드"
- 코드 컨벤션 — repo `CLAUDE.md` + `AGENTS.md`
- DB 스키마 — `supabase/migrations/20260529000010_rooms_v2_baseline.sql` (rooms_v2_baseline)
- 정책 SSOT — `packages/shared/src/policy.ts` (`POLICY` 상수)
- 디자인 시스템 — `@dei/ui` (`packages/ui/src/`) primitives 21 + patterns 16
- Realtime 규약 — `apps/mobile/lib/realtime.ts` (A↔C 합의 결과 적용 필요)
- 영상 stub — `apps/mobile/lib/video.stub.ts` (C 가 채울 대상)
- 권한 모듈 — `apps/mobile/lib/permissions.ts` (camera 는 실동작 / notification 은 stub)

---

## 0. 절대 규칙 (어기면 CI 차단)

1. **UI 는 `@dei/ui` 만.** `import { Button, Text, GridRoom, ... } from '@dei/ui';`
2. **스타일은 NativeWind className 토큰만.** `bg-bg`, `text-ink-3`, `rounded-md` 등.
   raw hex(`#fff`)·inline `style={{}}`·`StyleSheet.create` 전부 금지 (ESLint error).
3. **타입은 `@dei/api`** — `import type { Database } from '@dei/api';` 새 타입 정의 금지.
4. **에러 로깅은 `@dei/shared` `logger` 만** (`@sentry/react-native` 직접 import 금지).
5. **정책 값은 `POLICY` 상수만** (`packages/shared/src/policy.ts`). 매직 넘버 금지.
6. **이벤트 이름은 `lib/analytics-taxonomy.ts` 상수만.** raw 문자열 금지.
7. **DS 에 없는 시각요소 발견 시** → 직접 스타일링 금지 → A 에게 `@dei/ui` 추가 요청.

---

## 1. 작업 순서 (의존 순)

```
[0 선행 / 합의]                              [1 촬영 플로우]
C-1 영상 서빙 최적화 ─┐  (셀=썸네일 결정)    S11a 카메라 권한
C-2 grid 렌더 최적화 ─┤  (PM 우려 직결)      S11 3초 촬영
        │              │                      S11b 미리보기
        ▼              ▼                      S12 실패
C-0 영상 모듈    C-0b realtime/presence
        │              │
        └──────┬───────┘                      [2 방 본체]
               ▼                              S10 blur 미리보기
        [3 서버 L1]                           S13 일상 공유 방 (★)
        L1 영상 파이프라인                    S13b 영상 풀스크린
        L1 방 라이프사이클                    S14 멤버 프로필
```

권장 순번:

| # | 파일 | 우선순위 | 메모 |
|---|---|---|---|
| **0a** | `C-1-video-performance.md` | **P0** ⚠️ | **PM 명시 우려.** §1 핵심 결정 (셀=썸네일 vs 영상) 먼저 합의 |
| **0b** | `C-2-room-grid-performance.md` | **P0** ⚠️ | **PM 명시 우려.** 다수 매칭 시스템 = grid 성능 핵심 |
| 1 | `C-0-video-module.md` | P0 | 모든 촬영 화면이 여기 의존 (C-1 반영) |
| 2 | `C-0b-room-realtime.md` | P0 | A 와 채널 규약 합의 먼저 (C-2 와 정합) |
| 3 | `S11a-camera-permission.md` | P1 | 영상 모듈보다 가벼움. 패턴 확립용 먼저 |
| 4 | `S11-video-capture.md` | P1 | S04b 프로필 사진도 이 카메라 모듈 재사용 |
| 5 | `S11b-upload-preview.md` | P1 | 업로드 진입. C-0 의 영상+썸네일 동시 업로드 사용 |
| 6 | `S12-capture-failed.md` | P2 | 분기 alert 처리 |
| 7 | `S10-blur-preview.md` | P1 | 매칭 후 첫 진입. blur 게이트 |
| 8 | `S13-room-grid.md` | P0 ★ | dei 유일 시그니처. C-1/C-2 반영 필수 |
| 9 | `S13b-video-fullscreen.md` | P2 | poster + prefetch 적용 |
| 10 | `S14-member-profile.md` | P2 | 셀/풀스크린 아바타 탭 |
| 11 | `L1-room-lifecycle.md` | P1 | Edge Function. S13 자동 종료/자동 퇴장 백엔드 |
| 12 | `L1-video-pipeline.md` | P1 | Edge Function. signed-urls-batch RPC + cleanup |

---

## 1.5. PM 우려 대응 (절대 우선)

> **PM 메시지 요지**: "영상이 끊기거나 이러면 문제가 있다. 영상 최적화와 매칭된 방
> 측면 최적화 신경 써달라. 다수 매칭 시스템 개편으로 성능·화면 배치·시간대별 관리
> 신경 쓸 부분 많다."

→ **`C-1-video-performance.md`** + **`C-2-room-grid-performance.md`** 두 task 가 이 우려
직격 대응. 현재 코드 베이스에 누락된 11개 항목 + grid 5가지 시나리오 정리. **다른 화면
시작 전에 이 둘의 §1 핵심 결정 (셀=썸네일 vs 영상)부터 A 와 합의.**

핵심 결정 미합의 = 어떻게 짜도 끊김. 합의되면 나머지 작업이 결정에 맞춰 분기.

---

## 2. 시작 전 필수 합의 (A ↔ C)

핸드오프 가이드 §6 "첫 합의 필요" 항목. 코드 짜기 전에 A(최승원)와 다음을 합의:

### 2-1. 방 생성 핸드오프 계약 (A → C)
- **누가 `room` 행을 만드는가** — 매칭 엔진(A) 이 `room` row 만들고 `room_member`
  채워서 C 의 방 화면이 `roomId` 만 받아 SELECT 만 하면 되는지.
- **`group_match.room_id` 가 set 되는 시점** — 푸시 발송 직전인가 직후인가
  (직전이면 push 받고 들어왔을 때 방이 100% 존재).
- **C 가 호출하는 진입 API** — 직접 `room`/`room_member` SELECT vs RPC
  (예: `rpc('get_room_state', { room_id })`) 어느 쪽인가.
- **첫 영상 업로드 시점에 `room.active_member_count` 증가하는지** — blur 게이트
  판정과 직결.

### 2-2. Realtime 채널 경계 (A ↔ C)
현재 `apps/mobile/lib/realtime.ts` 가 단일 채널 `room:{roomId}` 위에 모두 흐른다고
규약. 그 위에서:

| 신호 | 담당 | 페이로드 형태 | 비고 |
|---|---|---|---|
| `message` INSERT (전체 채팅) | A | postgres_changes | 이미 `subscribeRoomMessages` 구현 |
| `message` INSERT (@멘션 귓속말) | A | postgres_changes + filter | whisper_to_user_id |
| `presence` (누가 방에 들어와있나) | **C** | presence sync | 누가 키 잡고 sync 하나, key=user_id |
| `video` INSERT (새 영상 모자이크) | **C** | postgres_changes | S13 자동 갱신 |
| `room_member` UPDATE (auto_kick/leave) | **C** | postgres_changes | 셀 빈칸 + 토스트 |
| broadcast `room_ended` | A or C? | broadcast | 마지막 1명 이탈 시 강제 broadcast 필요 여부 |

→ 합의 결과는 `C-0b-room-realtime.md` 의 "확정 규약" 섹션에 박는다.

### 2-3. blur 게이트 판정 위치
- 클라(`isClipVisible` 로컬 계산) vs 서버(RLS / view) 어느 쪽인지.
- **현재 `video.stub.ts` 시그니처는 비동기** = 서버 호출 여지 있음. 합의 후 확정.

### 2-4. 영상 서빙 정책 (C-1 §1) — **PM 우려 직격**
- **S13 셀 = 정적 jpg 썸네일 (옵션 A) vs muted autoplay 영상 (옵션 B/C)**.
- 권장 = 옵션 A (BeReal/Locket 패턴, 끊김 위험 ↓, 데이터 비용 ↓).
- C-1 §1 의 결정 체크박스에 합의 결과 박는다.

### 2-5. signed URL 발급 방식 (C-1 §3-2 / L1 §4-1b)
- 매 셀 fetch (8 RTT) vs 배치 RPC 1회.
- 권장 = 배치 RPC `get_room_signed_urls_batch(room_id, hour_from, hour_to)`.

---

## 3. 작업 루프

각 task .md 1개당:

1. 의존 task 가 끝났는지 확인 (선행 P0 가 안 끝났는데 P1 시작 X).
2. task .md 의 **체크리스트** 를 위에서부터 채우며 코드 작성.
3. 머지 전 검증:
   ```
   cd apps/mobile && pnpm exec tsc --noEmit
   pnpm -F mobile lint    # ds-enforce 포함
   pnpm verify            # chat-verify CI 게이트 로컬 재현
   ```
4. 실DB e2e 가 필요한 task(예: S13 realtime, L1 Edge Function) 는
   `try/finally` cleanup + 전용 e2e 유저(`e2e-*@example.test`)로 검증.

---

## 4. 산출물 위치

- 화면 코드 — `apps/mobile/app/(app)/room/[roomId]/*.tsx`, `apps/mobile/app/(app)/permission/camera.tsx`
- 영상/realtime 로직 — `apps/mobile/lib/video.stub.ts` → 실구현으로 교체, `apps/mobile/lib/realtime.ts` 확장
- Edge Functions — `supabase/functions/room-lifecycle/`, `supabase/functions/video-postprocess/` (신규)
- 마이그레이션 — 필요 시 `supabase/migrations/20260530XXXXXX_*.sql` (스키마 변경은 A 승인 필수)
- 테스트 — 컴포넌트는 옆 `__tests__/`, 통합은 `apps/mobile/__tests__/integration/`, e2e 는 `apps/mobile/e2e/`

---

## 5. 보고/머지 규약

- 단위 task 종료 시 task .md 상단 `status:` 갱신 (`pending` → `in_progress` → `done`).
- PR 본문에 task .md 경로 참조 (`docs/c-tasks/S13-room-grid.md`).
- 머지 전 A 1차 리뷰 (특히 `@dei/ui` 추가 요청·realtime 채널·RLS 게이트).

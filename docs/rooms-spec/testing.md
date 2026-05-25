# Rooms-Pivot 테스트 전략 (Phase 0.6)

> CLAUDE.md 의 Testing 규칙 1~9 를 새 도메인에 맞춰 구체화.
> 기존 `chat-verify.yml` 게이트 6단계 구조를 `rooms-verify.yml` 로 재정의.

---

## 계층별 테스트 매핑

| 계층 | 새 도메인 대상 | 위치 |
|---|---|---|
| **Unit (Vitest)** | `lib/room/`, `lib/group/`, `lib/blur-gate/`, `lib/mention-parser/` 의 순수 함수 | `lib/**/__tests__/*.test.ts` |
| **Component (Jest + RNTL)** | 모든 새 컴포넌트 (`components/room/*`, `components/group/*`, `components/home/MatchWaitingCard.tsx` 등) | `components/**/__tests__/*.test.tsx` |
| **Integration (Vitest + 실 Supabase)** | RLS 정책 검증, RPC 실행, 멀티 사용자 시나리오 | `apps/mobile/__tests__/integration/rooms-*.test.ts` |
| **Contract (Vitest + MSW + zod)** | 새 Edge Function 응답 스키마 | `packages/api/src/schemas/rooms/` |
| **E2E-web (Playwright)** | 화면 단위 (홈, 묶음 구성, 방 진입, 채팅, 차단/신고, 부스터) | `apps/mobile/e2e/playwright/specs/rooms-*.spec.ts` |
| **E2E-native (Maestro)** | 실기기 핵심 흐름 (가입 → 본인인증 → 묶음 → 매칭 → 영상 업로드 → 채팅) | `apps/mobile/.maestro/flows/rooms-*.yaml` |
| **실DB e2e (CLAUDE.md 규칙 7~9)** | 실제 원격 Supabase + Edge Function + ES256 JWT | `apps/mobile/__tests__/realdb/rooms-*.ts` |

---

## 스펙 flow → 보장 계층 매핑

PRD/userflow 의 주요 시나리오 별 어느 계층이 커버하는지:

| 스펙 | 시나리오 | 커버 계층 | 검증 위치 (예정) |
|---|---|---|---|
| R0 | 닉네임으로 묶음 구성 (D4) | Unit + Integration | `lib/group/__tests__/create.test.ts`, `rooms-group-rpc.test.ts` |
| R1 | 묶음 매칭 가용성 체크 (다른 방 사용 중?) | Integration | `rooms-match-queue.test.ts` |
| R2 | 운영진 방 편성 (`admin_create_room`) | Integration | `rooms-admin-create.test.ts` |
| R3 | 블러 게이트: 본인 업로드 전 피드 안 보임 | Component + Integration + E2E-web | `BlurGateOverlay.test.tsx`, `rooms-rls-blur.test.ts`, `rooms-r3-blur.spec.ts` |
| R4 | 3초 영상 업로드 + slot 중복 거부 | Unit + Integration + E2E-native | `lib/room/upload.test.ts`, `rooms-upload-slot.test.ts`, `.maestro/rooms-r4-upload.yaml` |
| R5 | 분할 피드 realtime 갱신 | E2E-web + 실DB e2e | `rooms-r5-feed.spec.ts`, `realdb/rooms-feed-realtime.ts` |
| R6 | 채팅 메시지 + @멘션 push | Component + Integration + E2E-web | `RoomChatComposer.test.tsx`, `rooms-chat-mentions.test.ts`, `rooms-r6-chat.spec.ts` |
| R7 | 차단: 양방향 숨김 + 자동 퇴장 임계값 | Component + Integration | `BlockConfirmDialog.test.tsx`, `rooms-r7-block.test.ts` |
| R8 | 신고 (카테고리 + 기타 자유 입력) | Component + Contract | `ReportReasonSheet.test.tsx`, `rooms-report-schema.test.ts` |
| R9 | 방 나가기 + 24h cooldown | Integration + E2E-web | `rooms-leave-cooldown.test.ts`, `rooms-r9-leave.spec.ts` |
| R10 | 부스터 구매 → cooldown 해제 | Integration + 실DB e2e | `rooms-booster.test.ts`, `realdb/rooms-booster-flow.ts` |
| R11 | 재매칭 큐 복귀 + 차단 합집합 제외 (그림 C) | Integration | `rooms-rematch-exclusion.test.ts` |
| R12 | 매시간 알림 + quiet hours | Unit + Integration | `lib/notifications/__tests__/quiet-hours.test.ts`, `rooms-notify-hourly.test.ts` |

---

## `rooms-verify.yml` 게이트 6단계

기존 `chat-verify.yml` 패턴을 그대로 답습:

```
lint → typecheck → unit → component → integration(실 Supabase) → e2e-web(Playwright)
```

집계 잡 `rooms-verify` 가 branch protection required check.
하나라도 실패하면 머지 차단.

**Integration 단계는 CI 에서 `supabase start` 로 실제 Supabase 띄우고 강제 실행.**
skip 0건 = 게이트 FAIL.

---

## 실DB e2e (CLAUDE.md 규칙 7~9 — CRITICAL)

DB/Edge/auth 가 모두 엮이는 핵심 flow 는 mock 으로 못 잡는 ①②③ 이슈가 있음:

1. ① 배포 상태: Edge Function 이 원격에 떠 있나
2. ② 환경변수 주입 시점: `EXPO_PUBLIC_*` 빌드타임 임베드 — .env 바꿔도 재빌드 전엔 옛 백엔드 봄
3. ③ 인증 토큰 형식 호환: ES256/JWKS — 구버전 supabase-js 거부

### 실DB e2e 시나리오 (필수)

| ID | 시나리오 | 호출 경로 |
|---|---|---|
| `realdb-r-matching` | 닉네임 묶음 → 큐 적재 → admin 편성 → room 생성 | 클라와 동일한 `supabase.functions.invoke('groups-create')` 등 |
| `realdb-r-blur-gate` | 방 진입 → 블러 → 업로드 → 블러 해제 → 24h 후 재적용 | `room-upload-video` Edge Function |
| `realdb-r-realtime-chat` | 멤버 A 메시지 전송 → 멤버 B 가 realtime 으로 수신 | `room-send-message` + `chat_messages` realtime |
| `realdb-r-block-kick` | 절반+ 차단 → 자동 퇴장 | `room-block-user` Edge Function |
| `realdb-r-booster` | 부스터 구매 → cooldown 해제 → 즉시 재매칭 | `booster-purchase-sync` + `booster-consume` |
| `realdb-r-cleanup` | 모든 위 시나리오 종료 후 테스트 데이터 0건 (시작=끝 카운트) | service_role 로 SELECT count |

### 실DB e2e 규칙

- **전용 테스트 유저**: `e2e-rooms-*@example.test` prefix
- **password grant 로 실제 ES256 JWT 발급** (service_role 우회 금지)
- **`functions.invoke()` 경로 사용** (RPC 직접 호출 금지)
- **`try/finally` 로 cleanup** — `groups`, `rooms`, `hourly_uploads`, `chat_messages`, `blocks`, `reports`, `booster_grants` 등 전부
- **시작 카운트 = 끝 카운트** 확인 후 success

---

## 매칭 + 멀티 사용자 시나리오의 어려움

PRD 의 매칭은 **여러 사용자가 동시에 참여하는 멀티 클라이언트 시나리오**.
mock 으로는 절대 못 잡는다.

### 해결 방안

- Integration 테스트에서 `supabase.auth.signInWithPassword` 로 서로 다른 유저 토큰 발급
- 각 유저별 별도 supabase client 인스턴스 (`createSupabaseClient(url, anon, { auth: { storage: ... } })`)
- realtime 채널은 별도 subscribe → 메시지 왕복 검증
- 패턴: `apps/mobile/__tests__/integration/_helpers/multiUserSession.ts` 신규 작성

---

## E2E-web Harness 변경

기존 `apps/mobile/e2e/harness/mockChatService.ts` 폐기.
새로 `mockRoomService.ts` 작성 — Playwright 가 `room/`, `group/`, `match_queue` 데이터를
mock 으로 제공.

원칙: 화면 코드는 절대 재구현하지 않음. 프로덕션 컴포넌트를 RN-web 으로 마운트하고
Supabase/router/auth 경계만 모킹.

---

## testID 네이밍 규약

기존 `chat-composer-send` 패턴 그대로:

| testID | 위치 |
|---|---|
| `room-feed-cell-<profileId>` | RoomFeedCell |
| `room-feed-blur-overlay` | BlurGateOverlay |
| `room-chat-composer-input` | RoomChatComposer |
| `room-chat-composer-send` | RoomChatComposer 전송 버튼 |
| `room-member-action-<profileId>` | MemberActionSheet 진입 버튼 |
| `room-block-confirm-button` | BlockConfirmDialog |
| `room-report-reason-<code>` | ReportReasonSheet 각 항목 |
| `room-leave-confirm-button` | LeaveRoomDialog |
| `group-invite-search-input` | GroupInviteSearch |
| `group-invite-add-<nickname>` | GroupInviteSearch 추가 버튼 |
| `home-solo-join-cta` | home.tsx 혼자 참여 |
| `home-group-new-cta` | home.tsx 함께 참여 |
| `home-rematch-cooldown-card` | RematchCooldownCard |
| `booster-purchase-button` | BoosterPurchaseSheet |

---

## 폐기 / 신규 테스트 파일 정리표

### 폐기 (Phase 1)

- `apps/mobile/e2e/playwright/specs/_screenshots.spec.ts`
- `apps/mobile/e2e/playwright/specs/ch-flows-10cdghi.spec.ts`
- `apps/mobile/e2e/playwright/specs/ch0-gate.spec.ts`
- `apps/mobile/e2e/playwright/specs/ch1-list.spec.ts`
- `apps/mobile/e2e/playwright/specs/ch2-room.spec.ts`
- `apps/mobile/e2e/playwright/specs/ch4-ch5-leave.spec.ts`
- `apps/mobile/__tests__/integration/chat-conversations-rls.test.ts`
- `apps/mobile/.maestro/flows/chat-10*.yaml`
- `apps/mobile/e2e/harness/mockChatService.ts`
- `apps/mobile/hooks/__tests__/useChatList.test.tsx`
- `apps/mobile/hooks/__tests__/useChatRoom.test.tsx`
- `apps/mobile/hooks/__tests__/useLike*.test.tsx`
- `apps/mobile/hooks/__tests__/useSendLike.test.tsx`
- `apps/mobile/app/(app)/__tests__/chat-*.test.tsx`
- `apps/mobile/components/chat/__tests__/`
- `apps/mobile/components/home/__tests__/`
- `apps/mobile/components/likes/`
- `apps/mobile/lib/chat/__tests__/`

### 신규 (Phase 4)

위 "스펙 flow → 보장 계층 매핑" 표의 모든 항목.

---

## CLAUDE.md 업데이트 필요 사항 (Phase 1 또는 4 종료 시)

- "채팅 검증 게이트" 섹션 → "방 검증 게이트" 로 갱신
- "스펙 flow → 보장 계층 매핑" 표 새 내용으로 교체
- e2e 결정 트리 위치: `apps/mobile/e2e/README.md` 도 재작성 필요

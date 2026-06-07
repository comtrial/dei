# Dei rooms/queue 제품 — PostHog 4대 퍼널 계측 + CI 검증 설계

> 작성: 2026-06-07 · 브랜치 `feature/c/20260607-queue-room-lifecycle-e2e` 기반(새 브랜치 권장)
> 목적: 현재 rooms/queue 제품에서 **MVP 출시 직후 "어디서 죽는가"에 데이터로 답할 수 있는
> 4대 퍼널**을 정의·계측하고, 그 퍼널 spine 이벤트가 **다른 사람의 구현으로 조용히 깨지지
> 않도록 CI 머지 게이트에 결정적(deterministic) 검증으로 편입**한다.

## 0. 배경 — 이미 있는 것과 없는 것 (정직 기록)

PostHog **인프라는 이미 완성**돼 있다. 새로 만들 필요 없음:

- `packages/shared/src/analytics.ts` — transport 패턴(DSN 없으면 console fallback).
- `apps/mobile/lib/posthog.ts` — PostHog SDK init + transport 등록 + 피처플래그.
- `providers/auth-provider.tsx` — `analytics.identify(userId, ...)` / `analytics.reset()` 동작.
- `apps/mobile/lib/analytics-taxonomy.ts` — 현재 제품의 `S##:` 이벤트 택소노미(다수 화면에 배선됨).

**주의 — 폐기된 옛 이벤트:** PostHog 프로젝트 "Dei"(id 399369)에는 `signup_completed`,
`like_*`, `match_completed`, `daily_log_*`, `first_log_cta_clicked` 등 funnel-shaped 이벤트가
떠 있으나, 이는 **rooms-pivot zero-base 로 폐기된 옛 제품(좋아요/1:1챗/큐레이션)** 의 것이며
현재 코드에 소스가 없다. 본 작업은 그것들을 **사용하지 않고**, 현재 rooms 제품의 `S##:`
이벤트를 기준으로 퍼널을 새로 정의한다. (옛 이벤트는 무접촉 — 무시.)

**없는 것 = 본 작업 범위:**
1. 현재 제품 퍼널을 잇는 **spine 이벤트 8건**(아래 §2)이 빠져 있어 퍼널이 끊긴다.
2. 4대 퍼널을 **단일 SSOT 로 코드화**한 것이 없다 → 누가 capture 한 줄을 지워도 못 잡는다.
3. PostHog 안에 **funnel insight/대시보드 정의**가 없다.

## 1. 퍼널 정의 (확정)

퍼널 = 순서 있는 단계 + 동일인 추적(identify) + 시간 창. 각 단계 통과 신호가 1개 이벤트.

### 퍼널 A — Activation (가입→온보딩→첫 진입)
- **질문:** 새 사람이 가입해 실제로 앱에 들어오는가? 어디서 죽는가(특히 인증·온보딩)?
- **분모:** 앱 첫 열기 · **분자:** 홈 첫 진입
```
app_opened → S02:terms_agreement_screen_entered → phone_verification_succeeded
  → onboarding_completed → S3:home_entered_waiting
```

### 퍼널 B — Match (큐 등록→방 입장)
- **질문:** 큐에 등록한 사람이 실제로 매칭돼 방에 들어가는가?
- **분모:** 큐 등록(S3:team_queue_registered) · **분자:** 방 입장 언블러(S5:room_joined_unblurred)
```
S3:home_entered_waiting → S3:team_queue_registered → room_matched
  → S4:room_preview_entered_blurred → S5:room_joined_unblurred
```
> 팀 경로 진입은 `S3:join_team_selected` 가 별도로 잡으나 퍼널 spine 은 솔로·팀 공통인
> `team_queue_registered` 를 분모로 둔다.

### 퍼널 C — Engagement (방 입장→영상/대화) · North Star 후보
- **질문:** 방에 들어간 사람이 실제로 영상·대화로 방을 살려내는가?
- **분모:** 방 입장 · **분자:** 영상 업로드 완료 or 채팅 발생
```
S5:room_joined_unblurred → S11:video_capture_entered → video_uploaded
  → S5:room_chat_opened → S5:whisper_mention_sent
```
> **North Star Metric** = *주간, 멤버 2명 이상이 활동(`video_uploaded` 또는 `room_chat_opened`)한
> 방의 수*. PostHog 에서 `room_id` breakdown + distinct actor ≥2 쿼리로 산출(실DB e2e 에서 실증).

### 퍼널 D — Safety/리텐션 + 결제 신호
- **질문:** 안전 사고(신고·차단·탈퇴)는 얼마나 나고, 유료 전환은 일어나는가?
```
결제 퍼널: booster_paywall_shown → booster_purchase_attempted → booster_purchase_succeeded
           (+ 기존 S18:payment_failure_alert_shown = 실패 분기)
안전 비율: S21:report_submitted · S20:withdraw_confirmed · block(report/block-report)
리텐션:   app_opened 기반 PostHog retention insight (코드 추가 불필요)
```

## 2. 추가할 이벤트 8건 (capture 위치 명시)

전부 `analytics-taxonomy.ts` 에 `F##:` prefix 상수로 추가 후 화면 1곳씩 `analytics.capture`.
prefix `F` = funnel-spine(기존 `S##:` 화면 이벤트와 구분).

| 퍼널 | event 키 | 발송 문자열(제안) | 파일 · 지점 | props |
|---|---|---|---|---|
| A | `app_opened` | `F0:app_opened` | `app/_layout.tsx` (initPostHog 직후, 1회) | `has_token`, `source`(cold_start) |
| A | `phone_verification_succeeded` | `F0:phone_verification_succeeded` | `app/(auth)/verify.tsx` `handleComplete` — `promoteWithIdentity(result)` 성공 직후 | `existing_member`(bool) |
| A | `onboarding_completed` | `F0:onboarding_completed` | `app/(onboarding)/profile/step3.tsx` `handleFinish` — profile update 성공 후(기존 `profile_step_completed` step3 옆) | — |
| B | `room_matched` | `F1:room_matched` | `app/(app)/queue.tsx` `routeToRoom(roomId)` 단일 지점(race-check·realtime 둘 다 경유) | `room_id`, `via`(race\|realtime) |
| C | `video_uploaded` | `F2:video_uploaded` | `app/(app)/room/[roomId]/upload-preview.tsx` `handleUpload` — `await uploadClip(...)` 성공 후 `router.replace` 전 (실패는 기존 `capture_failure_alert_shown` 이 잡음) | `room_id`, `duration_sec`(safeDurationMs/1000) |
| D | `booster_paywall_shown` | `F3:booster_paywall_shown` | `app/(app)/booster.tsx` 마운트(useEffect 1회) | `reason`(rematch_restricted) |
| D | `booster_purchase_attempted` | `F3:booster_purchase_attempted` | `booster.tsx` `handlePay` 진입 | `product_id` |
| D | `booster_purchase_succeeded` | `F3:booster_purchase_succeeded` | `booster.tsx` `handlePaymentComplete` — `confirmInstantRematchPayment` 성공 후(라우팅 전) | `product_id` |

규칙:
- 발송은 **반드시 `@dei/shared` 의 `analytics.capture(ANALYTICS_EVENTS.<key>, props)`** 경유.
  raw 문자열·`posthog-react-native` 직접 import 금지(CLAUDE.md, `lib/posthog.ts` 만 예외).
- 회복 가능한 예상 흐름(취소 등)은 capture 하지 않음. spine = "성공적으로 단계 통과" 신호만.
- 모든 신규 capture 는 그 화면의 happy-path(성공) 분기에만 둔다(분모/분자 정의와 일치).

## 3. 퍼널 SSOT 코드화 (계약의 근거)

```
apps/mobile/lib/analytics/funnels.ts   # 신규
```
4대 퍼널을 데이터로 선언한다. 각 step 은 `ANALYTICS_EVENTS` 의 키(런타임 문자열 아님)를 참조.

```ts
import { ANALYTICS_EVENTS, type AnalyticsEventKey } from '@/lib/analytics-taxonomy';

export interface FunnelDef {
  id: 'activation' | 'match' | 'engagement' | 'monetization';
  title: string;
  /** 순서 있는 step. 각 원소는 ANALYTICS_EVENTS 의 키. */
  steps: AnalyticsEventKey[];
}

export const FUNNELS: readonly FunnelDef[] = [ /* A/B/C/D 정의 */ ] as const;

/** 퍼널에 등장하는 모든 spine 이벤트 키(중복 제거) — contract 테스트가 검증. */
export const FUNNEL_EVENT_KEYS: readonly AnalyticsEventKey[] = /* derive */;
```

이 파일이 "퍼널이란 무엇인가"의 **단일 진실원천(SSOT)**이다. PostHog 대시보드도, contract
테스트도, e2e 스크립트도 모두 이 정의를 참조하므로 정의가 한 곳에서만 바뀐다.

## 4. 검증 전략 — 3계층 (CI 편입 명시)

### 계층 1 — Contract 테스트 (vitest unit · **CI 머지 게이트 ★**)
```
apps/mobile/lib/analytics/__tests__/funnel-contract.test.ts
```
- `FUNNELS` 의 모든 step 키가 `ANALYTICS_EVENTS` 에 실존(컴파일+런타임 동시 보장).
- 신규 8개 이벤트가 `ANALYTICS_EVENTS` 에 등록돼 있는지(키·발송문자열 prefix 규칙).
- 각 퍼널이 최소 2 step 이상(퍼널 성립 요건), id 중복 없음.
- `FUNNEL_EVENT_KEYS` 가 4대 퍼널의 모든 spine 을 빠짐없이 포함.
→ `pnpm --filter mobile test:unit` 경로라 **verify.yml 의 `unit` 잡에 추가 배선 없이 자동 편입**.
   누가 spine 이벤트 키를 지우면 typecheck(키 부재) 또는 이 테스트에서 **FAIL → 머지 차단**.

### 계층 2 — Component 테스트 (jest · **CI 머지 게이트 ★**)
각 신규 capture 지점이 실제로 그 화면에서 발사되는지(in-memory transport 주입):
- `verify.tsx` → 인증 성공 시 `phone_verification_succeeded`.
- `step3.tsx` → 저장 성공 시 `onboarding_completed`.
- `queue.tsx` → `routeToRoom` 시 `room_matched`.
- `upload(-preview).tsx` → 업로드 성공 시 `video_uploaded`.
- `booster.tsx` → 마운트/시도/성공 시 결제 3종.
→ `pnpm --filter mobile test:component` → verify.yml 의 `component` 잡에 자동 편입.
   (기존 화면 테스트가 있으면 거기 assertion 추가, 없으면 신규 최소 테스트.)

테스트 도구 경계(CLAUDE.md): in-memory transport 는 `registerAnalyticsTransport` 로 주입,
실제 PostHog 무접촉. Vitest=lib, Jest=RN 컴포넌트 경계 유지.

### 계층 3 — 실DB + 실PostHog E2E (온디맨드 · **게이트 밖**, 로컬/수동)
```
apps/mobile/scripts/e2e-posthog-funnels.ts   # 신규
package.json: "posthog:e2e": "tsx apps/mobile/scripts/e2e-posthog-funnels.ts"
```
- 전용 e2e 유저(`e2e-posthog-*@example.test`)로 4대 퍼널 spine 을 시간순 실제 발사
  (client 경로 = `@dei/shared` analytics 의 실제 wire format HTTP `/capture/`).
- PostHog 프로젝트 "Dei"(399369)에 도착 확인 + `query-funnel` 로 4대 퍼널 전환율 산출되는지
  = "4가지 질문에 답 가능" 실증. North Star(방당 distinct actor≥2)도 쿼리로 실증.
- `try/finally` 로 테스트 데이터 전량 cleanup. 기존 실데이터 무접촉(시작=끝 카운트 동일).
- **CI 머지 게이트엔 넣지 않음**(외부 PostHog 의존·dashboard 오염·비결정 → 게이트 부적합).
  필요 시 수동 실행. 결과 리포트: `docs/posthog-spec/rooms-funnels-e2e-report.md`.
- 키: `~/.dei/secrets.env`(repo 밖) + 공개 ingest key(`EXPO_PUBLIC_POSTHOG_KEY`) 사용.

## 5. PostHog 산출물 (대시보드)

실DB e2e 로 이벤트 도착·funnel 산출을 실증한 뒤, PostHog 에 4대 퍼널 insight 를 정의하고
"Rooms MVP Funnels" 대시보드에 묶는다(PostHog MCP `query-funnel`/`insight-create`/
`dashboard-create`). 영구 저장은 검증 통과 후 1회. (insight 정의 값은 §3 SSOT 와 일치시킨다.)

## 6. 영향 범위

- 화면: `_layout`, `verify`, `step3`, `queue`, `upload(-preview)`, `booster` (capture 1줄씩 추가).
- DB / RPC: 없음(이벤트 추가는 client capture). Edge Function: 없음(현 spine 은 전부 client 경로).
- 정책/상수: `analytics-taxonomy.ts` 에 상수 8건 추가, `analytics/funnels.ts` 신규.
- CI: verify.yml **변경 없음**(unit/component 잡 경로에 테스트가 자동 편입되도록 설계).

## 7. 범위 밖 (YAGNI)

- `account_withdrawn` 신규 이벤트(이미 `S20:withdraw_confirmed` 존재 — 그걸 안전 지표로 재사용).
- 실제 결제금액·매출 분석(가격/상품 확정 후). 결제는 **신호(시도/성공)** 만.
- P1/P2 화면 조회수 등 대량 이벤트(출시 후).
- 실PostHog e2e 를 CI required check 로 승격(사용자 결정: 로컬/수동만).

## 8. 검증 완료 정의 (CLAUDE.md "작업 완료 ≠ 검증 완료")

- [ ] typecheck (`pnpm typecheck`)
- [ ] lint / ds-enforce (`pnpm lint`, `pnpm ds-enforce`)
- [ ] unit — funnel-contract 테스트 실행·통과(skip 아님)
- [ ] component — 신규 capture 화면 테스트 실행·통과
- [ ] (온디맨드) `pnpm posthog:e2e` 로 4대 퍼널 실PostHog 도착·산출 실증 + 리포트

# Dei MVP PostHog 계측 설계

> 작성: 2026-05-24 · 브랜치 `feat/posthog-mvp-instrumentation`
> 권위 입력: `missoula-174-event-posthog-매핑`, `dei-mvp-posthog-계측-합의안` (Tolaria vault)
> 목적: 제품 첫 출시 직후 **4가지 핵심 질문**에 데이터로 답할 수 있게 P0 24건을 코드에 심고, 실제 PostHog 도착까지 관통 검증한다.

## 1. 목표 — "출시 후 답해야 하는 4가지 질문"

1. **Activation**: 새 사람이 가입하고 첫 로그를 찍는가? (어디서 죽는가 — 특히 SMS 인증, 가입→첫로그)
2. **Match**: 좋아요가 매칭으로 이어지는가?
3. **Conversation (North Star)**: 매칭이 실제 양방향 대화로 살아나는가?
4. **Safety/리텐션**: 차단·신고·탈퇴가 얼마나 나는가?

각 질문은 하나의 funnel 이며, P0 24건은 그 funnel 의 마디(node)다.

## 2. 핵심 아키텍처 결정 (코드 구조에서 도출 — 합의안과의 차이)

합의안은 7건을 `[S] server-side 필수`로 분류했으나, 실제 코드 경로를 짚으면
"server-side"가 두 종류로 갈린다. **SQL(RPC) 안에서는 HTTP capture 가 불가능**하므로:

| 합의안 [S] | 실제 코드 | 이 설계의 capture 위치 | 근거 |
|---|---|---|---|
| `message_sent` | `send-message` **Edge Function** (RPC 호출) | **Edge Function** | EF 가 RPC 200 응답을 받음 → 앱과 동일 경로에서 capture |
| `match_created_in_db` | `accept_like` **RPC**(SQL) ← client 호출 | **client** (RPC 200 직후) | SQL 안 HTTP 불가. client 가 성공 확인 |
| `like_send_persisted` | RPC ← client | **client** (RPC 200 직후) | 동일 |
| `chat_route_resolved` | `route-gate.ts` **순수 client 함수** | **client** | outcome 판정이 client 에서 일어남 |
| `phone_verification_succeeded` | client 가 인증 결과 수신 | **client** | 현재 인증 결과를 client 가 받음 |
| `signup_or_login_resolved` | `auth-provider.tsx` (client) | **client** (+ identify) | 세션 확정을 client 가 관측 |
| `payment_resolved` | 결제 미연동 | **보류** (EF 스텁만) | 결제연동 후 활성 |

결론: **진짜 server SDK 가 필요한 건 `message_sent` 1건**(Edge Function). 나머지는
"DB 결과를 받은 client"에서 capture 해도 funnel 이 끊기지 않는다. (사용자 승인됨)

## 3. 패키지 구조 — 기존 Sentry logger 패턴 그대로 복제

```
packages/shared/src/
  analytics.ts          # logger.ts 와 동일한 transport 패턴 (DSN 없으면 console fallback)
  index.ts              # export * from './analytics'
apps/mobile/lib/
  posthog.ts            # sentry.ts 와 동일 — PostHog SDK init + transport 등록
supabase/functions/_shared/
  analytics.ts          # Edge Function용 server capture (fetch /capture, posthog-node 불필요)
```

`@dei/shared` 의 `analytics` 공개 표면 (logger 와 대칭):

```ts
analytics.capture(event, props?)
analytics.identify(distinctId, props?)   // signup_or_login_resolved 지점
analytics.screen(name, props?)           // $screen (numbering_label)
analytics.setPersonProperties(props?)
analytics.reset()                        // 로그아웃
registerAnalyticsTransport(transport)    // mobile 진입점 1회 등록 / 테스트 in-memory 주입
```

규칙(CLAUDE.md 준수):
- 키 없으면 console fallback → CI/테스트 안전.
- 직접 `posthog-react-native` import 금지 (단, `apps/mobile/lib/posthog.ts` 제외) — Sentry 와 동일 원칙.
- 테스트는 `registerAnalyticsTransport` 로 in-memory transport 주입, 실제 PostHog 무접촉.

## 4. P0 24건 — capture 위치 매핑

| funnel | event | 위치 | 파일(예정) | props |
|---|---|---|---|---|
| Activation | `app_opened` | client | `app/_layout.tsx`/splash | has_token, source, app_version |
| | `onboarding_completed` | client | `(onboarding)` 마지막 | time_spent_sec |
| | `phone_verification_requested` | client | 인증 요청 핸들러 | attempt_count |
| | `phone_verification_succeeded` | client | 인증 결과 수신 | attempt_count, time_to_succeed_sec |
| | `signup_or_login_resolved` | client + **identify** | `auth-provider.tsx` | is_new_user |
| | `signup_completed` | client | `(onboarding)` P3 | total_interest_count, selected_categories |
| | `first_log_cta_clicked` | client | P4 CTA | — |
| | `log_recorded` | client | `result.tsx` 저장 성공 | log_id, duration_sec, is_first_log, entry_point |
| Match | `like_send_attempted` | client | OP4/like 핸들러 | peer_user_id |
| | `like_sent` | client | like 제출 | peer_user_id, attached_log_id, used_grant |
| | `like_send_persisted` | client(RPC 200) | like RPC 호출부 | peer_user_id, result |
| | `like_paywall_shown` | client | LK13 | reason |
| | `like_paywall_purchase_attempted` | client | LK13 | reason |
| | `like_accepted` | client | `useLikeResolution.ts` | peer_user_id, since_received_sec |
| | `match_created_in_db` | client(accept RPC 200) | `useLikeResolution.ts` | peer_user_id, source=accept |
| | `match_completed` | client | `matched/[matchId].tsx` | peer_user_id, source=accept |
| Conversation(NSM) | `chat_route_resolved` | client | `chat.tsx` | outcome(ENTERED\|BLOCKED\|ENDED) |
| | `chat_room_opened` | client | `chat/[conversationId].tsx` | conversation_id, message_count, entry_point |
| | `message_send_attempted` | client | composer | conversation_id, length |
| | `message_sent` | **Edge Function** | `send-message/index.ts` | conversation_id, message_id |
| Safety/리텐션 | `block_confirmed` | both | OP10 | target_user_id, had_match |
| | `report_submitted` | both | OP8 | reason, target_user_id, source_context |
| | `account_withdrawn` | both | MP10 | — |
| | `daily_log_incomplete` | client | DL8 | previous_log_count |
| (보류) | `payment_resolved` | EF 스텁 | (결제연동 후) | outcome, item_type |

## 5. identify / 설정 (합의안 §3)

- **identify/alias 시점 = `signup_or_login_resolved`** (번호 확정 = user_id 확정). 합의안이
  signup_completed 보다 앞당긴 이유 = 인증~가입 사이 이탈자가 익명/식별로 쪼개져 funnel 단절되는 것 방지.
- super properties: app_version, platform, has_token, is_new_user.
- 모바일이므로 web autocapture/$pageview OFF, 전부 manual capture. `$screen` 은 numbering_label 로.
- 로그아웃 시 `analytics.reset()`.

## 6. 4대 Funnel 정의 (PostHog 에서 수동 정의 — 그래프 신뢰 불가, 합의안 §0/§2)

```
Funnel 1 Activation:
 app_opened → onboarding_completed → phone_verification_requested
  → phone_verification_succeeded → signup_or_login_resolved
  → signup_completed → first_log_cta_clicked → log_recorded

Funnel 2 Match:
 like_send_attempted → like_sent → like_send_persisted(분모)
  → like_accepted → match_created_in_db(분자) → match_completed

Funnel 3 Conversation = North Star:
 match_created_in_db → chat_route_resolved(ENTERED) → chat_room_opened
  → message_send_attempted → message_sent
 ★ NSM = 한 conversation_id 에서 양쪽 user 모두 message_sent 있는 주간 conversation 수

Funnel 4 Monetization (구조만, 가격 미정):
 like_paywall_shown → like_paywall_purchase_attempted → payment_resolved(SUCCESS)
```

## 7. 테스트 전략 (CLAUDE.md 계층 규칙 준수)

| 계층 | 대상 | 도구 |
|---|---|---|
| Unit (Vitest) | `analytics.ts` transport 동작, console fallback, in-memory capture | `packages/shared/__tests__` |
| Component (Jest) | 각 화면이 올바른 event/props 로 `analytics.capture` 호출하는지 (mock) | `components/**/__tests__` |
| 실DB+PostHog e2e | 전용 e2e 유저로 4대 funnel event 실제 발송 → PostHog 도착·funnel 답변 가능 확인 | repo 밖 스크립트 + PostHog MCP |

핵심: component 테스트는 mock 이라 "PostHog 에 실제 도착"을 보장하지 못한다 →
**§8 실DB+PostHog 관통이 진짜 검증**(CLAUDE.md Testing 규칙 7·9).

## 8. 실DB + PostHog 관통 검증 (사용자 요구 "실제 posthog 에서 확인")

기준 패턴: `docs/chat-spec/e2e-realdb-report.md`.

1. 전용 테스트 유저(`e2e-posthog-*@example.test`)를 service_role 로 생성.
2. PostHog 프로젝트 "Dei"(id 399369) 로 **실제 키 사용** — 테스트 distinct_id 로
   4대 funnel 각 event 를 시간순 발송 (client 경로는 `@dei/shared` analytics 통해,
   `message_sent` 는 `send-message` Edge Function 실제 invoke).
3. PostHog MCP 로:
   - `read-data-schema events` 에 24건 event 가 나타나는지 확인.
   - `query-funnel` 로 4대 funnel 각각이 step 을 인식하고 전환율을 산출하는지 = "4가지 질문에 답 가능" 증명.
4. `try/finally` 로 테스트 유저·DB row 전량 cleanup. 기존 실데이터 무접촉.
5. 검증 리포트: `docs/posthog-spec/e2e-posthog-report.md`.

배포 산출물 체크리스트 (CLAUDE.md 규칙 8):
- [ ] `send-message` Edge Function 재배포 (message_sent capture 추가분)
- [ ] Edge secret `POSTHOG_API_KEY` 주입 (`supabase secrets set`)
- [ ] `.env` 에 `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` 추가
- [ ] 앱 경로 e2e 통과 (functions.invoke 포함)

## 9. 범위 밖 (YAGNI)

- P1/P2 event (화면 조회수 등 150건) — 출시 후 추가.
- 실제 결제 연동 (`payment_resolved` 활성) — 가격 확정 후.
- PostHog 대시보드/insight 영구 저장 — 검증은 query 로 충분, 영구 저장은 별도.

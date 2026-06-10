# Dei rooms/queue 4대 퍼널 — 실PostHog e2e 런북

> 대상: PostHog 프로젝트 "Dei"(id 399369) · 브랜치 `feature/c/20260607-posthog-rooms-funnels-clean`
> 설계: `docs/superpowers/specs/2026-06-07-rooms-funnels-design.md`
> 플랜: `docs/superpowers/plans/2026-06-07-posthog-rooms-funnels.md`
>
> 이 문서는 **검증 결과 리포트가 아니라 실행 런북**이다. 실PostHog e2e 는 실제
> 이벤트를 보내고 PostHog dashboard 를 건드리므로 **CI 머지 게이트가 아니라
> 온디맨드(사람이 직접 실행)** 다. 아래 절차로 4대 퍼널이 실제 PostHog 에서
> 산출되는지 확인한다. 실행 후 결과는 이 문서 하단 "실행 기록"에 append 한다.

## 1. 무엇이 이미 CI 로 보장되는가 (실행 불필요)

다음은 `verify.yml` 머지 게이트(unit·component 잡)에서 **항상 자동 검증**된다.
실PostHog e2e 없이도 "퍼널 spine 이 코드에서 깨지지 않음"이 보장된다:

| 보장 | 위치 | 게이트 잡 |
|---|---|---|
| 4대 퍼널 정의 존재·step 키 실존·spine 8건 등록·prefix 규칙 | `lib/analytics/__tests__/funnel-contract.test.ts` | unit |
| spine 키 삭제/오타 시 컴파일 실패 | `lib/analytics/funnels.ts` 의 `steps: AnalyticsEventKey[]` (TS2820) | typecheck |
| 각 화면이 올바른 event/props 로 capture 호출 | `verify`/`step3`/`queue`/`booster`/`upload-preview` `__tests__` | component |

> 회귀 실증(2026-06-07): `funnels.ts` 의 `app_opened` 를 `app_opened_TYPO` 로
> 바꾸면 `tsc` 가 `error TS2820 ... Did you mean '"app_opened"'?` 로 즉시 FAIL.
> 원복 시 통과. → "다른 사람이 spine 을 깨면 머지 게이트가 잡는다" 확인됨.

## 2. 실PostHog e2e 가 추가로 검증하는 것 (CI 로 못 잡는 것)

- 이벤트가 **실제 PostHog 에 도착**하는지(transport·키·네트워크 egress).
- PostHog 가 그 이벤트들로 **4대 퍼널 전환율을 산출**할 수 있는지(= "4가지 질문에
  데이터로 답 가능").
- North Star(engagement 방당 distinct actor ≥ 2) 산출 가능 여부.

## 3. 실행 절차

### 사전 준비
1. 공개 ingest key 가 필요하다(`EXPO_PUBLIC_POSTHOG_KEY`). 키는 repo 밖
   `~/.dei/secrets.env` 에 둔다(=레포에 커밋 금지).
2. `(선택)` 고유 run id 를 정해 기존 데이터와 안 섞이게 한다.

### 발사
```bash
# 키 주입 (repo 밖 secrets)
set -a; source ~/.dei/secrets.env; set +a
# 고유 run id (기본값 e2e-posthog-funnels-local 도 가능)
export POSTHOG_E2E_RUN_ID="e2e-$(date +%Y%m%d-%H%M)"   # 예시 — date 가 없으면 임의 문자열
pnpm posthog:e2e
```
성공 시 `[posthog-e2e] 발사 완료: N events, distinct_id=..., run_id=...` 출력.
키 미설정 시 `EXPO_PUBLIC_POSTHOG_KEY 미설정 ...` 가드로 즉시 종료(아무것도 안 보냄).

발사되는 것: 4대 퍼널의 모든 spine 이벤트를 **동일 distinct_id 로 순서대로**
(activation 5 + match 5 + engagement 4 + monetization 3 = 17) + North Star 실증용
2번째 actor 의 `video_uploaded` 1건. 모든 이벤트에 `e2e_run_id` super-prop 부착.

### PostHog 에서 확인 (MCP 또는 웹)
`e2e_run_id` = 위 run id 로 필터한 뒤:

1. **도착 확인** — `read-data-schema events` 에 `F0:`~`F3:` spine 이벤트가 보이는지.
2. **4대 퍼널 산출** — `query-funnel` 로 아래 4개 각각이 step 을 인식하고 전환율을
   내는지(= 답 가능 실증):
   - activation: `F0:app_opened → S02:terms... → F0:phone_verification_succeeded → F0:onboarding_completed → S3:home_entered_waiting`
   - match: `S3:home_entered_waiting → S3:team_queue_registered → F1:room_matched → S4:room_preview_entered_blurred → S5:room_joined_unblurred`
   - engagement: `S5:room_joined_unblurred → S11:video_capture_entered → F2:video_uploaded → S5:room_chat_opened`
   - monetization: `F3:booster_paywall_shown → F3:booster_purchase_attempted → F3:booster_purchase_succeeded`
3. **North Star** — engagement 의 `F2:video_uploaded` 를 `room_id` breakdown,
   같은 `e2e-room-*` 에 distinct distinct_id ≥ 2 인지(= 방당 2인 이상 활동).

> 퍼널 step 의 정확한 이벤트 문자열은 `lib/analytics-taxonomy.ts` 와
> `lib/analytics/funnels.ts`(SSOT)가 단일 진실원천이다. 위 목록과 SSOT 가
> 어긋나면 SSOT 를 따른다.

### 정리
이 스크립트는 전용 `e2e_run_id`/`distinct_id` 로만 식별되는 이벤트를 보낸다.
PostHog 이벤트는 개별 삭제가 번거로우므로, 분석 시 항상 `e2e_run_id` 필터로
실데이터와 분리한다(실데이터 무접촉). dashboard/insight 영구 저장은 검증
통과 후 별도로 만든다.

## 4. 한계 (정직 기록, CLAUDE.md Testing 규칙 9)

- 이 스크립트는 client 이벤트를 **앱과 동일 wire format 의 HTTP `/capture/`** 로
  보낸다. 단, **앱 빌드타임 임베드(`EXPO_PUBLIC_POSTHOG_KEY`)** 실제 주입은 앱
  재빌드 e2e 가 필요하며 본 스크립트로는 대체된다(동일 wire format).
- 현재 rooms 제품의 spine 은 **전부 client 경로**라 server SDK(Edge Function)
  경유 이벤트는 없다(옛 채팅 `message_sent` 같은 EF capture 는 이 제품엔 없음).
- `F3:booster_purchase_succeeded` 는 앱에서 PortOne `onComplete` 콜백 경유라
  component 테스트로는 직접 발사를 시뮬레이트하지 않는다 — 이 스크립트가 그 도착을
  대신 실증한다.

## 5. 실행 기록 (실행할 때마다 append)

| 일시 | run_id | 발사 건수 | 4대 퍼널 산출 | North Star | 비고 |
|---|---|---|---|---|---|
| (미실행) | — | — | — | — | 키 주입 후 §3 절차로 실행 예정 |

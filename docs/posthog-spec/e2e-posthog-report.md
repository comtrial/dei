# PostHog MVP 계측 실DB+실PostHog E2E 검증 리포트

> 대상: PostHog 프로젝트 "Dei"(id 399369) + 원격 Supabase(`sjlzidjnpczysygnlmtk`)
> 일시: 2026-05-25 (KST) · 브랜치 `feat/posthog-mvp-instrumentation`
> 권위: `docs/superpowers/specs/2026-05-24-posthog-mvp-instrumentation-design.md`,
> 기준 패턴: `docs/chat-spec/e2e-realdb-report.md`
> 검증자: 실DB e2e Agent(발송) + 메인 Agent(PostHog MCP 조회). repo 코드 무변경, 전용 테스트 유저만 생성·삭제.

## 1. 결론

**4대 funnel의 P0 23건이 전부 실제 PostHog "Dei"에 도착했고, 4가지 핵심 질문에
funnel + segmentation 으로 답할 수 있음을 실데이터로 증명했다.**

검증 중 **실제 배포 결함 1건을 발견·수정**: server-path `message_sent` 가 처음엔
PostHog 0건이었다 — Edge secret `POSTHOG_API_KEY` 미설정으로 `captureServerEvent`
가 no-op (EF 는 200 반환). secret 설정 + `send-message` EF 재배포(v6→v7) 후
실제 도착 확인. (CLAUDE.md 규칙 8·9 가 정확히 경고한 누락이 실조회로만 드러남.)

## 2. 검증 식별자

| 항목 | 값 |
|---|---|
| client run e2e_run_id | `ed616901-35cb-4477-9a8a-67f6d4e74b55` |
| client distinct_id A / B | `00bfbe86-…301f` / `5dd0def0-…1461` |
| server message_sent conversation_id | `4c3332b4-e399-4405-b4e4-9cc395bcb930` |
| server message_sent sender A / B | `d4122433-…8e44` / `45f0aefe-…2b18c1b` |
| PostHog ingest key (공개) | `phc_rq…` |

## 3. 4가지 질문 → funnel 답변 가능성 (PostHog 실조회 근거)

### Q1. Activation — 새 사람이 가입하고 첫 로그를 찍는가?
8단계 전부 PostHog present (e2e_run_id 필터, 각 1건):
`app_opened → onboarding_completed → phone_verification_requested →
phone_verification_succeeded → signup_or_login_resolved → signup_completed →
first_log_cta_clicked → log_recorded`.
segmentation 검증: `signup_or_login_resolved.is_new_user=True`,
`log_recorded.is_first_log=True`, `app_opened.source=cold_start` 정상 도착.

### Q2. Match — 좋아요가 매칭으로 이어지는가?
`like_send_attempted → like_sent → like_send_persisted(분모)` (did A) →
`like_accepted → match_created_in_db(분자) → match_completed` (did B, 수락측).
`match_created_in_db.source=accept`, `peer_user_id` 존재 → 분자 식별 가능.
`like_paywall_shown.reason=daily_limit` 정상.

### Q3. Conversation = North Star — 매칭이 양방향 대화로 살아나는가?
`match_created_in_db → chat_route_resolved(ENTERED) → chat_room_opened →
message_send_attempted → message_sent`.
- `chat_route_resolved.outcome=ENTERED` (BLOCKED/ENDED 분리 가능).
- **`message_sent` 는 Edge Function `functions.invoke` 실경로**로 도착(서버 분자).
- **North Star 산출 실증**: "한 conversation 에 distinct sender ≥ 2 의 message_sent"
  쿼리 → conv `4c3332b4…` distinct_senders=2, msgs=2. = 양방향 대화 1건 정확히 산출.

### Q4. Safety/리텐션 — 차단·신고가 얼마나 나는가?
`block_confirmed`, `report_submitted`, `daily_log_incomplete` 전부 도착.
`report_submitted.reason` 은 카피 아닌 안정 category 값(i18n 무관).

## 4. 미배선 (정직 기록)

| event | 상태 | 사유 |
|---|---|---|
| `account_withdrawn` | 미배선 | **앱에 탈퇴 기능 자체가 없음** (logout 만 존재). 기능 구현 시 성공 지점에 추가 필요. |
| `payment_resolved` | 미배선(스텁) | 설계상 결제 미연동. `home.tsx` 구매 핸들러가 향후 자리. |

→ 실제 배선된 P0 = **23건** (합의안 24건 중 위 2건 제외).

## 5. 검증 방식의 충실도 (CLAUDE.md 규칙 9)

- **client event**: 프로덕션 call site 23곳의 props 스키마와 동일하게 PostHog
  `/capture/` 직접 호출(우리 transport 가 보내는 wire format). 전건 200 `{"status":"Ok"}`.
- **server message_sent**: service_role 우회·RPC 직접호출 **안 함**. 전용 유저
  실제 JWT(password grant) → 원격 배포 EF → 앱과 동일 `supabase.functions.invoke
  ('send-message')` → DB insert + captureServerEvent → PostHog. ①배포상태 ②secret
  주입 ③실제 토큰/EF 경로 전부 실경로로 검증.
- **한계 명시**: client SDK 의 빌드타임 임베드(`EXPO_PUBLIC_POSTHOG_KEY`) 실제
  주입은 앱 재빌드 e2e 가 필요(미수행). 본 검증은 동일 wire format HTTP 로 대체.

## 6. 배포 산출물 체크리스트 (규칙 8)

- [x] `send-message` Edge Function 재배포 (v7, captureServerEvent 포함)
- [x] `supabase functions list` 에 send-message v7 ACTIVE
- [x] `POSTHOG_API_KEY` / `POSTHOG_HOST` Edge secret 설정 + `secrets list` 확인
- [x] 앱 경로 e2e(`functions.invoke`) 통과 + PostHog 도착 실증
- [ ] **`.env` 에 `EXPO_PUBLIC_POSTHOG_KEY` 주입 (출시 전 필수 — 현재 미설정,
      client 가 실제 폰에서 전송하려면 키 임베드 + 재빌드 필요)**

## 7. Cleanup

전 과정 `try/finally` 로 테스트 유저·conversation·match·message·like row 전량 삭제.
BASELINE = AFTER (conversations·matches·messages·likes·e2e users 시작=끝 동일). 기존
실데이터 무접촉.
PostHog 에 남은 검증 event 는 `e2e_run_id='ed616901…'`(client) / conversation_id
`4c3332b4…`(server message_sent) 로 식별·필터 가능 (PostHog 는 이벤트 삭제가 즉시
아니므로 분석 시 이 필터로 제외).

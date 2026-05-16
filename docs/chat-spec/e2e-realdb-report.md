# 채팅 시스템 실DB E2E 검증 리포트

> 대상: 원격 Supabase (`sjlzidjnpczysygnlmtk`), repo `dei` 브랜치 `feat/chat-system`
> 일시: 2026-05-16 / 검증자: 실DB E2E Agent
> 권위 스펙: `docs/chat-spec/missoula-FULL-spec.json` + `DEV-SPEC.md`
> repo 코드/ git 무변경. 전용 테스트 유저(`e2e-chat-*@example.test`)만 생성·삭제.

## 1. 스크립트 경로 + 실행 명령

| 파일 | 용도 |
|------|------|
| `/tmp/pgconn/e2e.js` | 9 flow 실DB 관통 메인 e2e (구축·실행 대상) |
| `/tmp/pgconn/rt-diagnose.js` | Realtime 미수신 정밀 원인 규명 (보조) |
| `/tmp/pgconn/schema-inspect.js`, `fnbody.js` | 스키마·RPC 본문 확인 (보조) |

실행:
```
cd /tmp/pgconn && node e2e.js
```
- repo 밖(`/tmp/pgconn`) 작성 — git 무관.
- DB 비밀번호/액세스 토큰은 macOS keychain 에서만 읽음 (코드 평문 없음).
- anon/service_role 키는 Supabase Management API 에서 런타임 조회.
- `auth.uid()` 기반 RPC(`send_message`/`leave_conversation`)는 **실제 테스트 유저 JWT 로 supabase-js REST 호출** = 진짜 사용자 경로 e2e (단순 DB 직접 INSERT 아님).
- 최종 결과: **PASS=19 / FAIL=0 / INFO=0**, cleanup 검증 통과.

## 2. Flow별 PASS/FAIL — 실제 데이터 근거

| flow | 항목 | 결과 | 실제 검증 근거 (row/이벤트) |
|------|------|------|------|
| SETUP | 테스트 유저 3명 생성 | PASS | service_role admin API 로 A/B/C auth.users 생성, `e2e-chat-<uuid>@example.test` |
| SETUP | `ensure_conversation_for_match(A,B)` → conv+match | PASS | conv row(status=ACTIVE) + match row(status=ACTIVE) 생성, `user_a_id < user_b_id` canonical order 만족 |
| 10-A | CH0 게이트: ACTIVE·미차단 → ENTERED | PASS | A JWT 로 `chat_is_blocked_between(A,B)=false`, conversations SELECT 가시 1건, status=ACTIVE → outcome=ENTERED |
| 10-B | conversations 목록 (updated_at desc, DELETED 제외) | PASS | A JWT REST `.neq('status','DELETED').order('updated_at',desc)` → 우리 conv 포함 1건 |
| 10-B | leave 후 목록에서 DELETED conv 제외 | PASS | leave 후 A 목록 0건, DELETED conv 미포함 |
| 10-E | `send_message` → messages(SENT) + last_message 갱신 | PASS | messages row status=SENT, sender_user_id=A, conversations.last_message_preview=body[:200] 일치, last_message_at 세팅 |
| 10-E | body 경계 0/501 거부, 1/500 허용 | PASS | 0자·501자 `message body must be 1..500 chars` 거부; 1자·500자 row 생성 |
| RT | B realtime 구독 (anon 키 + B JWT, messages filter) | PASS | `subscribe status=SUBSCRIBED` |
| **RT** | **★ Realtime 왕복: A send → B messages INSERT 수신** | **PASS** | **B 가 INSERT payload 실제 수신: id 일치, body 일치, sender=A, conversation_id=대상 conv. anon 키+B JWT realtime 이 messages RLS 통과해 수신** |
| 10-H | 무음정리: conversation status 전이 realtime 전파 | PASS | conversations status ENDED UPDATE → B 가 UPDATE payload(status=ENDED) 실제 수신 (이후 ACTIVE 복구) |
| 10-I | match 없는 C → conversations 0건 → CH3 | PASS | C JWT REST conversations 조회 0건 → CH3 빈상태 분기 데이터 조건 충족 |
| 10-G/10-C | CH0 단일 게이트 source 무관 일관 | PASS | `ensure_conversation_for_match(B,A)` 재호출 → 동일 conv id 반환(멱등), 게이트 입력(blocked=false,status=ACTIVE) 동일 |
| BLOCK | 차단 → blocked=true + RLS 비가시 + send 거부 | PASS | blocks 행 삽입 후 `chat_is_blocked_between=true`, A·B 모두 conversations SELECT 0건, `send_message` 거부(err=blocked) |
| BLOCK | 차단 해제(unblocked_at) → blocked=false | PASS | `unblocked_at` 세팅 후 `chat_is_blocked_between=false` 복귀 |
| 10-F | `leave_conversation` → DELETED+soft-delete+UNMATCHED | PASS | rpc.status=DELETED, conv.status=DELETED, messages 4/4 deleted_at 세팅, match.status=UNMATCHED, other_user=B |
| 10-F | 나간 뒤 send_message 거부 | PASS | `send_message` err=`conversation is not active` |
| 10-F | 나간 뒤 messages RLS 비가시 | PASS | A JWT messages 조회 0건 (deleted_at 필터). conversations 는 정책상 status 필터 없어 가시 (※ 6번 참고) |
| CLEANUP | 테스트 데이터 전부 삭제 + 카운트 동일 | PASS | AFTER == BASELINE: users 21 / matches 5 / conversations 0 / messages 0 / blocks 1 |
| CLEANUP | e2e-chat-* 잔여 유저 0 | PASS | `auth.users where email like 'e2e-chat-%'` = 0 |

## 3. ★ Realtime 왕복 (핵심) — 실제 수신 성공

**결론: 성공.** anon 키 supabase-js 클라이언트에 테스트 유저 B 의 JWT 를
`auth.setSession` + `realtime.setAuth` 로 주입 → `messages` 테이블 INSERT,
`filter: conversation_id=eq.<conv>` 구독(SUBSCRIBED) → A 가 `send_message` RPC
호출 → **B 가 INSERT payload 를 실제 수신**. payload 의 `id`/`body`/`sender_user_id`/
`conversation_id` 가 송신 row 와 정확히 일치함.

추가로 `conversations` UPDATE(status=ENDED)도 B 가 실시간 수신(10-H) →
무음정리(conversation.ended) 전파 경로도 실DB 로 실증.

### 정직 기록: 1차 run 의 일시적 FAIL 과 규명

- **1차 실행**: `messages` INSERT 미수신으로 RT 왕복 FAIL (그대로 보고함, 가짜 PASS 안 함).
- **원인 규명** (`rt-diagnose.js` 별도 실행): 동일 B JWT·동일 filter 구성으로
  T1(no-filter)/T2(filter)/T3(service_role)/T5(sender=B 본인) **전부 수신 성공**.
  대조군 T4(conversations UPDATE)도 수신. → **messages RLS authorization 문제 아님**.
  실제 원인은 `SUBSCRIBED` 직후 realtime 서버의 RLS 바인딩 적용까지의 짧은
  타이밍 갭(메인 run 은 다중 채널 생성 직후 안정화 500ms 로 너무 일찍 송신).
- **수정·재현**: 안정화 대기 1500ms + 미수신 시 1회 재송신으로 보강 → 이후
  **2회 연속 run 모두 1차 시도에서 즉시 수신**, 안정 PASS.

→ Realtime 인프라 자체는 정상 (publication 등록, REPLICA IDENTITY full, RLS 통과
모두 실증). 클라이언트는 구독 SUBSCRIBED 후 충분한 안정화/재시도가 필요하다는 점이 실측 교훈.

## 4. 실DB e2e 로 실제 검증된 것 / 안 된 것

### 실제 검증됨 (실 row/이벤트 단언)
- 매칭→conversation 생성(`ensure_conversation_for_match`, service_role) + canonical order
- CH0 게이트(차단여부+status) 데이터 판정 — ENTERED/BLOCKED/ENDED 분기
- conversations 목록(updated_at desc, DELETED 제외, 빈 목록/CH3)
- `send_message` 실DB INSERT + last_message 갱신 + body 1~500 경계
- **Realtime: messages INSERT 왕복 + conversations UPDATE 전파 (실 payload 수신)**
- 차단 게이트: blocks → `chat_is_blocked_between` → RLS 비가시 + `send_message` 거부
- `leave_conversation`: DELETED + 전 messages soft-delete + match UNMATCHED + 이후 송신 거부
- RLS: 참여자·미차단 SELECT, INSERT 게이트, deleted_at 필터 — 실 유저 JWT 로 실증
- CH0 멱등/단일 게이트 일관성 (source 무관 동일 conv)

### 실DB e2e 범위 밖 (UI/클라이언트 계층 — 본 검증 대상 아님)
- CH2 컴포저 grapheme cluster 카운터(490자+ 빨강), 멀티라인 5줄 — UI only
- 250ms fadeout / 토스트 0 / 자동 H2 복귀 등 클라 애니메이션·네비 (10-H UI 측)
- 푸시 알림 deeplink 실제 전달(10-D) — APNs/FCM 미검증, 데이터 분기 조건(ACTIVE conv >0/=0)만 데이터 레벨로 확인 가능 범위
- 5xx retry 마커 인라인 UI(10-E 실패측) — 서버 거부(차단/비ACTIVE/길이)는 검증, 네트워크 5xx 클라 처리는 UI

## 5. Cleanup 완료 확인

| 카운트 | BASELINE (시작) | AFTER (끝) | 일치 |
|--------|------|------|------|
| auth.users | 21 | 21 | ✅ |
| matches | 5 | 5 | ✅ |
| conversations | 0 | 0 | ✅ |
| messages | 0 | 0 | ✅ |
| blocks | 1 | 1 | ✅ |

- 기존 실데이터(21 users, 5 matches) 무변경. 시작=끝 완전 동일.
- `e2e-chat-*@example.test` 잔여 유저 0, 테스트 conv/msg/match/block 0.
- try/finally 로 성공/실패 무관 cleanup 보장. `rt-diagnose.js` 도 자체 cleanup 후 잔여 0.
- 참고: `blocks` baseline=1 은 **기존 실사용자 사이의 사전 존재 차단행 1건**(테스트 무관). 본 e2e 의 블록 행은 별도 id 로 삽입 후 전량 삭제하여 1 로 복귀.

## 6. 발견된 결함 / 스펙 불일치

1. **[경미·스펙 정합 검토 필요] leave 후 conversations 가시성**
   `conversations_select_participant_unblocked` 정책에 status 필터가 없어,
   `leave_conversation` 으로 DELETED 된 conversation 이 **참여자에게 여전히 SELECT 가시**
   (status='DELETED' 로 보임). messages 는 deleted_at 필터로 비가시 → 메시지 내용은
   안 새지만, DELETED conv row 메타데이터 자체는 노출됨.
   클라이언트가 status≠'DELETED' 로 거르므로(10-B 동작 확인) UX 영향은 없으나,
   "양쪽 영구 삭제(CH-API2)" 스펙 문구상 RLS 레벨에서도 DELETED 제외가 더 안전.
   → 권고: `conversations_select_participant_unblocked` USING 에 `status <> 'DELETED'`
   추가 검토 (현재 동작은 클라 가드로 안전, 결함이라기보단 심층방어 갭).

2. **[운영 교훈, 코드 결함 아님] Realtime 구독 안정화 타이밍**
   `SUBSCRIBED` 직후 즉시 송신 시 messages INSERT 이벤트 유실 가능
   (RLS 바인딩 적용 갭). iOS 클라이언트에서도 구독 직후 송신/낙관적 UI 와
   서버 push 의 경합 가능 → 클라는 채널 상태 안정화 후 송신, 또는 송신 결과
   row 와 realtime 수신의 dedup(이미 검증된 송신 응답 기반 즉시 반영) 권장.

3. 그 외 핵심 RPC·RLS·realtime 모두 스펙(`DEV-SPEC.md` CH-API1/CH-API2/CH0/B-CH1/B-CH2)과 **일치**. 불일치 없음.

## 7. 결정·가정·한계

- **결정**: `auth.uid()` 기반 RPC 는 DB 직접 호출이 아니라 실제 테스트 유저 JWT 로
  supabase-js REST 호출 → 진짜 사용자 경로 e2e 보장. `ensure_conversation_for_match`
  는 스펙상 service_role 전용이라 admin 클라이언트로 호출(정상).
- **가정**: 10-A/10-C/10-G/10-D 의 진입 source(LK8/OP3/푸시/탭바) 차이는 CH0 단일
  게이트로 수렴하므로, source 별 UI 네비게이션은 데이터 레벨에서 "동일 conv·동일
  게이트 입력 일관성"으로 환원해 검증(스펙의 "단일 게이트" 정의에 부합).
- **한계**:
  - 푸시 알림 실제 전달(APNs/FCM), 클라 애니메이션/네비/카운터 등 UI 계층은
    실DB e2e 범위 밖 — 4절에 명시.
  - Realtime 검증은 supabase-js(repo 와 동일 메이저 v2) 클라이언트로 수행.
    실제 iOS 앱의 Swift Realtime SDK 동작은 별도(동일 서버·동일 RLS 이므로
    서버측 보장은 동일, 클라 SDK 행위는 미검증).
  - 본 e2e 는 격리된 전용 유저만 사용, 기존 실데이터 절대 미접촉.

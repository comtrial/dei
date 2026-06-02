# 개발 공유 — 채팅(S13a) · 통합 · 매칭 엔진 · hotfix (2026-06-02)

> 대상: 팀 전체(A/B/C). 이번 세션에 main 에 반영된 것 + 알아야 할 것 + 후속.
> 한 줄 요약: **방 내부 채팅(S13a) 완성 → ver2↔main 통합 → 빠른 매칭 엔진(Supabase 완전구현) → UUID 프로덕션 버그 hotfix.** 매칭·채팅이 원격 Dei 에 실제 배포·검증됨.

---

## 1. 머지된 PR (전부 main 반영)

| PR | 내용 | 상태 |
|---|---|---|
| #41 | S13a 방 내부 단체채팅 + @귓속말 (풀스택) | MERGED (→release/dei-ver2) |
| #47 | ver2(채팅) ↔ main(인증·매칭·영상·방) 통합 | MERGED |
| #48 | 매칭 알고리즘 설계+명세+구현(스키마/RPC/Edge)+테스트 | MERGED |
| #49 | UUID_PATTERN 손상 hotfix (enqueue-match-queue + leave-room) | MERGED |
| #45 | 협업·브랜치 거버넌스 규칙 (CLAUDE.md + AGENTS.md) | **OPEN** (리뷰 대기) |

---

## 2. 채팅 (S13a) — 완성 (owner A)

방 내부 **전체 단체채팅 + @1:1 비밀 귓속말** 단일 화면. `apps/mobile/app/(app)/room/[roomId]/chat.tsx`.
- DS: `ChatBubble`(them/me/whisper/mention) · `InputBar`(귓속말 모드) · `MentionAutocomplete`(신규) · `NewMessageJumpButton`(신규) · `Avatar.photoUrl`(신규).
- 백엔드: `message`(+whisper_to_user_id, client_msg_id 멱등) · `send_room_message` RPC · `send-message` Edge(ACTIVE).
- **귓속말 보안**: RLS `message_select_member` 가 realtime postgres_changes 에 구독자 JWT 로 적용 → 제3자 미수신. 실DB e2e F3(C 미수신 음성단언)로 검증.
- 추가: 풀네임 타이핑 귓속말 해석, 본문 @토큰 강조, 아바타 탭→S14 프로필(`?userId=`), 방종료 읽기전용.
- **알아야 할 것(A→C)**: realtime 은 `room:{roomId}` 채널 규약 공유, `room_member.status`/`room.status='ended'` 가 채팅 가시성·종료를 자동 트리거. 상세 = `docs/handoff/A-to-C-room-chat-contract.md`.

---

## 3. 매칭 엔진 — 신규 (빠른 매칭 최우선, Supabase 완전구현, 앱 배포 의존 0)

**혼자/친구 참여가 섞인 큐에서 반대 성별 묶음을 최대한 빠르게 매칭.** 매칭 로직 전부 RPC+Edge, 앱은 enqueue+구독만 → **규칙·임계값 변경해도 앱 재빌드 불필요**.

### 동작
- **순수 이벤트 기반**(cron 없음): `enqueue-match-queue` Edge 가 큐 적재 직후 `try_match` 호출 → 상대 있으면 즉시 방 생성.
- **Tier 완화**: 정확일치(2:2,3:3) → 비대칭(3:2, 5:3) → solo merge(혼자 여럿을 합성팀으로, 3:3도 OK). 대기시간 boost 로 기아 0.
- **상한**: 한쪽 ≤5, 합 ≤8 (성비 5:3). team.target_size 1..5.
- **런타임 토글**: `match_config.automation` = manual_admin_curation | auto_immediate | auto_scored (SQL 로 토글, 앱 무관). **현재 main 기본 = manual** (자동매칭 켜려면 auto_immediate 로).

### 핵심 객체 (원격 Dei 적용됨)
- 마이그레이션: `team` CHECK 1..5 + `kind`(user|synthetic), `match_queue.required_gender`, `match_config`.
- RPC: `match_and_create`(synthetic merge + 원자 생성) / `try_match`(Tier 페어링) / `_try_solo_merge` / `admin_force_match`(운영 수동 편성 백도어) / `expire_my_stale_queue`(lazy).
- Edge: `enqueue-match-queue` (try_match 연동, ACTIVE).

### 검증
- integration 27/27 PASS (실 RPC) — `apps/mobile/__tests__/integration/matching-rpc.test.ts`
- 앱경로 e2e 6/6 PASS (실 user JWT → functions.invoke → 즉시매칭) — `scripts/e2e-matching-realdb.mjs`
- **adversarial edge 재검증**(48 correct/8 bug) → high 3건 즉시 수정: 소유가드(try_match auth.uid), 성별 위변조 재검증, 더블시트 거부.

### 문서
- 설계: `docs/superpowers/specs/2026-06-02-matching-algorithm-design.md`
- 정밀 명세: `docs/matching-spec/ALGORITHM-SPEC.md`
- 구현계획: `docs/superpowers/plans/2026-06-02-matching-engine.md`

---

## 4. 🔴 프로덕션 버그 hotfix (PR #49, 모두 알 것)

`enqueue-match-queue` + `leave-room` 의 `UUID_PATTERN` 정규식이 손상(`[89ab][0-9a-f]{12}$` — 4번째 그룹 dash·길이 누락)돼 **어떤 표준 UUID 도 매칭 못 함** → 두 Edge 가 사실상 모든 요청 거부(매칭 진입 불가 / 방 나가기 불가)였음.
- 원인: B 원본 정규식 오타. **앱 동일 경로 e2e 에서만 드러남**(mock/unit/integration-service-role 다 통과) — CLAUDE.md §9 의 산 증거.
- 수정: 표준 8-4-4-4-12. 두 Edge **라이브 배포 완료** + main 머지.
- 추가 수정: enqueue 의 `match_config` jsonb 파싱(따옴표 포함 문자열 → JSON.parse, 자동매칭 미트리거 버그).

---

## 5. 후속 / 알아야 할 것

- **#45 거버넌스 PR 리뷰 대기** — AI 협업 규칙(브랜치 네이밍·PR 본문·수정전 보고·작업완료≠검증완료). Claude+Codex 둘 다 적용.
- **B 확인 요청**: 본인인증 기존회원 승격 시 도메인 데이터 이관 범위 — `docs/handoff/A-to-B-identity-promotion-data-scope.md` (room_member/message orphan 가능성, MEDIUM).
- 매칭 medium 버그 4건(SL-03 Tier 대칭성·errcode·killswitch) — 기록됨, 후속.
- CI 워크플로우 중복(`verify.yml` + `ci.yml`) 정리 필요.
- 매칭 `db:gen-types` 원격 재생성 / 자동매칭 활성(automation=auto_immediate) 시점은 운영 결정.
- ⚠️ 매칭 스키마·Edge 는 **원격 Dei 에 이미 적용·배포됨**(개발 진행상). main 코드와 동기화 상태.

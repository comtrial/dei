# S13a — 방 내부 단체채팅 + @귓속말 설계서

> 상태: 설계 (구현 전). owner = A. route = `apps/mobile/app/(app)/room/[roomId]/chat.tsx`.
> 4축 병렬 리서치(UX / 백엔드·Supabase / DS 갭 / lazyweb) → 교차검증 종합 기반.
> 권위 SSOT: `docs/handoff/screens/S13a.md`, `supabase/migrations/20260529000010·000020`,
> `apps/mobile/lib/realtime.ts`, `packages/ui/src/patterns/{ChatBubble,InputBar}.tsx`,
> `packages/shared/src/policy.ts`, `supabase/functions/_shared/auth.ts`, `CLAUDE.md(8·9)`.

---

## 1. 목표와 불변 제품결정

S13a 는 **매칭된 영상 방 안의 단일 채팅 화면**이다. 전체 단체채팅이 기본이고,
`@`로 특정 멤버에게 **1:1 비밀 귓속말**을 보낼 수 있다. 별도 DM 페이지 없음 —
방 안에서만 작동하며, 방 종료 시 메시지는 휘발한다.

**불변 제품결정 (변경 금지):**
1. **귓속말 = 1:1 비밀.** `@`대상 1명. 발신자와 대상만 그 메시지를 본다. 나머지 방 멤버에겐 안 보인다.
2. **방 = 양팀 전원(2~8명) 단일 단체채팅.** `group_match`의 team_a+team_b → `room_member status='active'`.
3. **범위 = 풀스택 1방향 관통.** 화면 + @자동완성 + send-message Edge Function/RPC + realtime 수신 + 멘션 푸시 + 실DB e2e(앱 동일 `functions.invoke` 경로).

**사용자 확정 결정 (2026-05-30):**
- **글자수 단위 = code point.** 클라 charcount / Edge 검증 / DB CHECK 전부 `[...body].length`. DB `char_length(body) between 1 and 500` 그대로. `Intl.Segmenter` 미사용.
- **나간 멤버(`status='left'`) 귓속말 = 막는다.** 대상은 "현재 방 active 멤버"만. 클라 후보 제외 + 서버 재검증 둘 다.
- **방 종료 후 = 읽기전용 유지 후 30일 purge.** 종료 직후 composer disabled + 종료 배너, 사용자가 닫을 때까지 유지. hard delete 는 `POLICY.video.hardDeleteAfterDays`(30일). purge 후 재진입 시 `StateView` empty. 즉시 blank 금지.
- **실시간 삭제/차단 반영 = 다음 방 진입 시(MVP).** realtime 은 INSERT-only 유지. 귓속말 비밀성은 RLS 가 전달 시점에 막으므로 영향 없음. 클라는 렌더마다 block 상태 재평가(방어).

---

## 2. 현 상태 검증 결과 (직접 Read 로 확인)

| 항목 | 상태 |
|---|---|
| `message`(body 1..500 code point, `whisper_to_user_id`, status sent/deleted) + `message_mention` | ✅ 존재 (000010) |
| RLS `message_select_member` (귓속말 가시성 + 양방향 차단 숨김) | ✅ 존재 (000020 L89-94) |
| realtime publication `room`/`room_member`/`message` + `replica identity full` | ✅ 존재 (000010 L372-382) |
| `room:{roomId}` 채널 규약 + `subscribeRoomMessages`(INSERT-only) | ✅ 존재 (`lib/realtime.ts`) |
| DS `ChatBubble`(them/me/whisper/mention) + `InputBar`(@placeholder, charcount) | ✅ 존재 |
| `policy.ts` `quietHoursExempt` 에 `whisper_mention` 포함 | ✅ 존재 (L104) |
| analytics 상수 `room_chat_opened`/`whisper_mention_sent` | ✅ 존재 |
| **`send-message` Edge Function** | ❌ **미존재 (greenfield)** |
| **`send_room_message` RPC** | ❌ **미존재 (greenfield)** |
| **`message.client_msg_id` 컬럼 + 멱등 인덱스** | ❌ **미존재 (필수 선행)** |
| **`push_token` 테이블** | ❌ **미존재** |
| @자동완성 패널 / 전송실패 표시 / 새메시지 점프 버튼 (DS) | ❌ **미존재 (DS 선행 추가)** |

---

## 3. 귓속말 보안 모델 (제3자 누수 방지) — 최우선

> 이것이 S13a 의 단 하나뿐인 make-or-break 정확성 속성이다.

**판정 (Supabase 공식 동작):** RLS `message_select_member` 는 `postgres_changes` broadcast 에도
적용된다. Supabase Realtime 은 변경 행을 **구독자의 JWT 컨텍스트에서** 각 테이블 SELECT RLS 를
재평가한 뒤 전송하며, USING 절이 false 인 구독자에겐 행을 보내지 않는다. 검증된 정책은
`room_is_member AND NOT is_blocked_between AND (whisper_to_user_id IS NULL OR whisper_to_user_id=auth.uid() OR user_id=auth.uid())`
이므로, C 의 JWT 로는 A→B 귓속말이 USING=false → **전달 안 됨**. `message` 는 publication 에 있고
`replica identity full`(올바른 RLS 평가에 필수)도 확인됨.

**load-bearing 전제 (반드시 지킬 것):**
- realtime 소켓이 **구독자의 살아있는 인증 JWT** 를 실어야만 위 보안이 성립. `subscribeRoomMessages` 는
  `supabase` 싱글톤을 쓰므로 세션이 anon/만료면 RLS 가 잘못된(anon) 컨텍스트로 평가된다.
  → **구독 전에 `supabase.auth` 인증 세션 보장**, 토큰 갱신 시 realtime client `setAuth` 호출.
- `filter: room_id=eq.X` 는 **프리필터일 뿐 비밀 책임 0.**
- 방어 belt: 수신측에서 `whisper_to_user_id` 가 self 도 sender-self 도 아닌 들어온 메시지는 drop(절대 1차 가드 아님).
- 푸시 payload 에 **메시지 본문 미포함**('귓속말이 도착했어요'만).

**검증 = 실DB e2e F3 (mock/unit 으론 절대 못 잡음):** A/B/C 3명 active, 각자 **본인 ES256 JWT** 로
realtime 구독. A→B 귓속말 `functions.invoke`. B 수신 양성단언 / **C 미수신 음성단언**(timeout=PASS,
수신=즉시 FAIL=누수). + C 의 JWT REST SELECT 0행. service_role 우회 금지(RLS bypass 라 거짓 통과).

---

## 4. 화면 해부 (DS 매핑)

슬라이드업 BottomSheet(78% 높이) + 다음 구성:

| 영역 | DS 컴포넌트 | 비고 |
|---|---|---|
| 시트 핸들 | `SheetHandle` | 36×4 ink-4, top radius 24 |
| 헤더 | `TopNav` | 방 이름 + 멤버 수 `Badge` + 닫기 |
| 메시지 스트림 | inverted `FlatList` + `ChatBubble`(them/me/whisper) | 무한스크롤(키셋 페이지네이션) |
| 메시지 행 래퍼 | `MessageRow`(화면 로컬) + `ChatBubble` sendState | 낙관/전송중/실패 |
| 새 메시지 점프 | **`NewMessageJumpButton`(신규 primitive)** | '↓ N개 새 메시지' floating pill |
| @자동완성 | **`MentionAutocomplete`(신규 pattern)** | InputBar 위 floating, 차단/나간/self 제외 |
| 입력 | `InputBar`(whisper-mode 확장) | 귓속말 칩 헤더 + accent 톤 + placeholder swap |
| 빈/로딩/종료 상태 | `StateView` / 종료 배너 | empty='아직 메시지가 없어요' / 종료='종료돼 사라졌어요' |

**상태:** empty / loading / loaded / sending / error / room-ended.

### DS 선행 작업 (화면 코드 전에 `@dei/ui` 에 추가 — raw 스타일 위반 방지)

1. **`MentionAutocomplete`(신규 pattern)** — InputBar 바로 위 floating 후보 패널. `Avatar(28)+닉네임` 행, 단일 탭 선택. caller 가 self/blocked/left 사전 제외, DS 는 표시+선택만. `Select`(트리거 전용)·`Popover`(고정위치) 와 다름 → 신규. 토큰 0 신규.
2. **`InputBar` whisper-mode 확장** — `whisperTarget != null`이면 제거 가능한 대상 `Chip` 헤더 + accent 톤 + placeholder '{name}에게만 보이는 귓속말…'. `whisperTarget==null`이면 **기존과 byte-identical**(회귀 테스트 강제).
3. **`ChatBubble` sendState 확장** — me 변형 한정 `sending`(opacity↓+Spinner)/`sent`(기본)/`failed`(danger '!'+탭 onRetry). them/whisper/mention 경로 불변(default 'sent').
4. **`NewMessageJumpButton`(신규 primitive)** — floating pill, accent+white+ArrowDown, count<=0/visible=false → null. `Badge`(순수 표시) 와 달리 탭+floating 소유.
5. **배럴 export + `cn()` font-size 감사** — 신규 2종 export, 비표준 size 토큰을 color 와 한 `cn()`에 섞지 않기(메모리 함정).

---

## 5. 핵심 플로우

- **(a) 전체채팅 전송:** `client_msg_id` 1회 생성 → 낙관적 prepend → `functions.invoke('send-message')`(RPC 폴백) → `client_msg_id`로 reconcile. `logger.withErrorCapture('chat.send')`. 빈/초과는 pre-send 차단(캡처 안 함).
- **(b) @자동완성→귓속말:** `@` 입력 → 닉네임 prefix 필터 후보(self/blocked/left 제외) → 탭=대상확정 → InputBar 귓속말 칩+accent 톤 전환 → 전송. 칩 × = 모드 해제. **단일 대상만**(1:1 강제). 이벤트 `whisper_mention_sent`.
- **(c) 수신 자동스크롤 vs badge:** 스크롤 하단이면 auto-scroll, 위면 `unseen++` & `NewMessageJumpButton` 표시(telegram 패턴).
- **(d) 아바타 탭 → S14** 멤버 프로필.
- **(e) 전송실패 → 재시도:** 버블 옆 '!'(인라인, 토스트 누적 X) → 탭 = **동일 `client_msg_id`로 재전송**(멱등).
- **(f) 나감/방종료 무음정리:** 종료 수신 시 composer disabled + 종료 배너, 즉시 blank 금지(§1 결정).

`client_msg_id`가 낙관·재시도·realtime 에코 dedup 의 단일 linchpin.

---

## 6. 백엔드 계약

`send-message` Edge(앱 1차 경로) + `send_room_message` RPC(폴백) **양쪽에서** 재검증:
`room_is_member` / `room.status='active'` / body 1..500 code point + trim /
귓속말(대상 ≠ self · 대상 active 멤버 · `NOT is_blocked_between`). 위반 시 구조화 4xx.

- **zod `sendMessage` 스키마**(`packages/api/src/schemas/`)가 mobile↔Edge **단일 SSOT**(contract test).
  - req: `{ room_id, body(1..500 code point), whisper_to_user_id?, client_msg_id }`
  - 200: `{ ok, message{...}, deduped:boolean }`
  - err: 400 invalid_payload / 401 / 403 not_room_member / 409 room_not_active / 422 invalid_whisper_target{reason:self|not_member|blocked} / 422 body_length
- RPC 호출은 **`supabaseAsUser`(user JWT)** 로 → `auth.uid()=sender`. service_role 호출 시 `auth.uid()=NULL`로 거부(auth.ts 계약).
- `_shared/auth.ts` 계약 **변경 금지**(타 함수 의존). ES256 은 `getUser(token)` 서버검증 경로라 안전 — 로컬 `jwt.verify`로 리팩토링 금지, supabase-js 다운그레이드 금지.

---

## 7. 스키마 델타 (멱등 마이그레이션, A 거버넌스)

```sql
-- message dedup (낙관/재시도/에코의 linchpin)
alter table public.message add column if not exists client_msg_id uuid;
create unique index if not exists message_client_dedup_uniq
  on public.message(room_id, user_id, client_msg_id) where client_msg_id is not null;
-- (선택) self-whisper belt
alter table public.message add constraint message_no_self_whisper
  check (whisper_to_user_id is null or whisper_to_user_id <> user_id);  -- 신규 행만

-- push_token (멘션 푸시)
create table if not exists public.push_token (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists push_token_user_idx on public.push_token(user_id);
-- RLS: self all; Edge 는 service_role 로 읽음(발신자가 수신자 토큰 못 봄)
```

**DDL 체크리스트:** message.client_msg_id — PK=N(기존 id 유지) / NOT_NULL=N(back-compat) / INDEX=Y(partial unique) / FK=N / DEFAULT=N / TYPE=uuid / NAMING=Y. push_token — PK=Y((user_id,token) 복합) / NOT_NULL=Y / INDEX=Y / FK=Y(cascade) / DEFAULT=Y(updated_at) / NAMING=Y. **PK 설정 확인했습니까? → Y.**
마이그레이션 후 **`pnpm db:gen-types` 재실행 필수.** read-state 테이블 미도입(미읽음 dot = 클라 로컬).

---

## 8. Realtime 수신 설계

`subscribeRoomMessages(roomId, onInsert)` 헬퍼만 사용(직접 채널 금지, C 영상/presence 와 공유).
`onInsert`: `client_msg_id`/`id` dedup → 방어 필터(남의 귓속말/차단 발신자 drop) → 하단이면 auto-scroll
/ 위면 `unseen++` & 점프 버튼. **live-session JWT 전제(§3).** cleanup 에서 unsubscribe 호출.
재연결 시 마지막 커서 이후 갭-필(REST refetch). **UPDATE(삭제/차단) 미구독은 MVP 한계로 명시**(§1 결정).

---

## 9. 멘션 푸시 설계

귓속말만 푸시(전체채팅 푸시 0). Edge inline best-effort 디스패치(실패가 send 실패 아님), 7조건 ALL:
`whisper_to_user_id` not null / 대상 active 멤버 / `notification_setting.chat_mention=true` /
`push_enabled=true` / quiet-hours(0~7 KST) **exempt**(`quietHoursExempt`에 `whisper_mention` 포함) /
대상 ≠ sender / 대상 토큰 존재(없으면 skip, 에러 아님). payload = `{ title:<발신자 닉네임>, body:'귓속말이 도착했어요', data:{roomId, type:'whisper_mention'} }` — **본문 미포함**.
`expo-notifications` 설치 + `registerPushToken`(로그인/방진입 upsert). `EXPO_PUBLIC_*`는 빌드타임 임베드 → 변경 시 재빌드(CLAUDE.md 9②).

---

## 10. 엣지 케이스 매트릭스 (발췌, 15+)

차단 과거메시지 양방향 숨김 / 귓속말 대상 mid-leave(→422 not_member) / 501자(→422 body_length, code point) /
네트워크 끊김 중 재시도(동일 키 멱등) / realtime 끊김 갭필 / 동시·연속 전송 순서(created_at,id 정렬) /
self-whisper(→422 self) / deleted 메시지(다음 진입 반영) / 종료 직전 in-flight / 키보드·시트 충돌 /
푸시진입+차단 경합(CH0 식 게이트로 흡수) / 페이지네이션 경계 / 새벽 quiet-hours 멘션 푸시 예외 /
@자동완성 중 후보 멤버 나감(탭-time 재검증) / 빠른 연속전송(각 distinct 키). — 각 [기대 UX / RLS·데이터 함의 / 테스트 계층].

---

## 11. 배포 산출물 체크리스트 (CLAUDE.md 8·9)

- [ ] 마이그레이션 적용(local `db:reset` 검증 → remote `db push`)
- [ ] **`supabase functions deploy send-message`** (마이그레이션과 별개 — 안 하면 앱 '전송 실패')
- [ ] `supabase functions list` 에 send-message 존재
- [ ] `supabase secrets list` 에 URL + service_role + **anon**(없으면 auth.ts 가 service_role 폴백 → auth.uid()=NULL)
- [ ] `pnpm db:gen-types` 재실행
- [ ] **앱 동일 `functions.invoke` 경로 실DB e2e 통과** (RPC 직접 e2e 금지 — Edge 미배포 못 잡음)

---

## 12. 검증 전략 (계층별 + 실DB e2e)

| 계층 | 대상 | 도구 |
|---|---|---|
| Unit | 낙관 머지/dedup/정렬, 길이게이트(code point), whisper 가드 순수로직, 갭필 커서 | Vitest |
| Component | 신규/확장 DS(회귀 포함), 송신 낙관 버블·실패·재시도·@칩 전환·charcount | Jest+RNTL |
| Contract | sendMessage zod(req/res) mobile↔Edge | Vitest+MSW+zod |
| Integration | RPC 가 실 RLS 로 room_is_member/active/block/self/length 거부, ON CONFLICT 멱등 1행 | Vitest+실 Supabase |
| **실DB e2e** | **F1~F9 앱 경로·실 ES256 JWT·realtime 왕복·귓속말 음성단언** | /tmp 스크립트 |

**실DB e2e (앱 동일 `functions.invoke`, service_role 우회 금지, try/finally cleanup, BASELINE==AFTER):**
F1 전체채팅 send / F2 realtime 왕복 / **F3★ 귓속말 B수신·C미수신 음성단언(보안 생사)** /
F4 차단 숨김 / F5 비멤버 거부 / F6 멱등 2회→1행 / F7 길이경계(이모지 code point) /
F8 ES256 토큰 401 안 남 / F9 멘션 푸시 데이터 분기.
> 보고는 "통과율"이 아니라 **"①배포 ②env ③ES256 토큰 포함, 앱 동일 경로 e2e 로 검증"** + 못 한 항목(APNs 실전달 등) 명시.

---

## 13. 구현 순서 (풀스택 1방향 관통)

1. **DS 선행** — MentionAutocomplete → InputBar whisper 확장 → ChatBubble sendState → NewMessageJumpButton → 배럴/cn 감사. (Jest 회귀+신규, Vitest import)
2. **백엔드 계약** — client_msg_id 마이그레이션 → push_token → send_room_message RPC → sendMessage zod → send-message Edge. (Vitest unit/contract, Integration 실 RLS)
3. **화면** — 시트 셸 + 스트림 + 송신(낙관·멱등) + @자동완성/귓속말. (Jest component, Vitest unit)
4. **Realtime 수신** — 구독 + dedup + 방어필터 + 자동스크롤/badge. (Vitest unit, Jest component)
5. **푸시** — expo-notifications + registerPushToken + Edge dispatch. (Vitest unit, Integration)
6. **배포 산출물 + 실DB e2e** — gen-types → push → deploy → list/secrets → F1~F9. (실DB e2e)

각 단계는 TDD(테스트 먼저) — verify 게이트(ds-enforce→typecheck→unit→component→integration) 통과 전제.

---

## 14. 리스크 등재 + 후속

- 멘션 푸시 폭주 → coalesce/rate-limit (post-MVP)
- UPDATE 미구독(실시간 삭제/차단 미반영) — MVP 한계, post-MVP UPDATE 구독
- stale `database.types.ts` — gen-types 누락 시 타입 드리프트
- `auth.ts` 로컬-decode 리팩토링 금지(ES256), supabase-js 다운그레이드 금지
- 종료 방 30일 purge 잡(휘발 정책) — `POLICY.video.hardDeleteAfterDays` 연동 후속

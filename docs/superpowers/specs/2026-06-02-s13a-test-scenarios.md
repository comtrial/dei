# S13a 채팅 테스트 시나리오 매트릭스 (Agent team 발굴)

> 2026-06-02 · 7개 차원 병렬 발굴(멘션/길이/스크롤/머지/귓속말RLS/방종료/키보드-UI) →
> 중복 제거 + 계층 배정. 총 발굴 235건, 신규 갭 152건.
> 발굴은 멀티에이전트 Workflow(s13a-test-scenario-discovery)로 수행.

I now have complete grounding across all target files, existing tests, RLS migration, RPC, route, and hook. I have everything needed to produce the gap analysis. Let me compile the final answer.

Key corrections to the JSON I found by reading the actual code:
- `parse-whitespace-boundary` is **already covered** by `mention.test.ts:23-28` (the `@@수아` after-space cases use the `(?:^|\s)@+` boundary).
- `resolve-strip-multiple-at` is **effectively covered** by `mention.test.ts:103-108` (`@@수아` → confirmed, strippedInput `''`), so demote.
- `parse-emoji-korean-combination` / `room-chat-view-mention-no-multiline` — `\S*`/`\S+` semantics; genuine unit gaps.
- The third-party whisper filter at `useRoomChat.ts:61` is a real **component/unit** gap (currently zero test on that defense line).
- `room_not_active` RPC error is a real integration gap (RPC line 24-26 exists, no test).
- whisper RLS visibility (3-party, blocked) has **zero** integration coverage — the highest-risk gap per CLAUDE.md.

---

S13a 채팅의 7개 차원·235건을 실제 코드(`mention.ts`/`scroll.ts`/`message-merge.ts`/`length.ts`/`RoomChatView.tsx`/RLS migration/RPC/`chat.tsx`/`useRoomChat.ts`)와 6개 기존 테스트 파일에 대조한 결과, **진짜 신규 갭은 41건**입니다(JSON의 `alreadyCovered:false` 중 중복·이미커버 12건은 제외/병합). 계층 분포: integration 17(가장 위험), unit 13, component 8, e2e-web 3. **가장 중요한 3개**: (1) 귓속말 3자 가시성 차단 — RLS(`message`정책 L89-93)에 통합 테스트 0건, mock 불가, 기밀성 핵심. (2) `useRoomChat.ts:61` 남의 귓속말 drop 방어선 — 단위/컴포넌트 모두 0건인데 RLS 우회 시 유일한 belt. (3) `room_not_active` 서버 게이트(RPC L24-26) — 클라 `roomEnded`는 UX일 뿐, 종료 방 전송 차단의 실제 보증은 통합에서만 검증 가능.

JSON 대비 수정: `parse-whitespace-boundary`(이미 mention.test.ts:23-28 커버)·`resolve-strip-multiple-at`(@@수아 confirmed로 mention.test.ts:103-108 커버) 2건은 갭 아님으로 제외. `whisper-blocked-recipient-hidden`/`whisper-blocked-sender-hidden`은 한 통합 테스트로 병합. e2e-web 가시성 시나리오는 RLS-fetch 의존이라 integration과 중복 → 대표 1건만 유지.

| id | 계층 | kind | 시나리오(input→expected) | 테스트 위치 | 비고 |
|---|---|---|---|---|---|
| whisper-third-party-hidden | integration | normal | A→B 귓속말, 제3자 C 조회 → 그 메시지 0행 | `__tests__/integration/whisper-rls.test.ts` (신규) | **최우선**. RLS L93 `whisper_to_user_id=auth.uid() OR user_id=auth.uid()` 핵심 기밀성. mock 절대 불가 |
| whisper-recipient-visibility | integration | normal | A→B 귓속말, 수신자 B 조회 → 보임 | `whisper-rls.test.ts` | RLS L93. send_room_message로 실제 발신→B JWT 조회 |
| whisper-sender-visibility | integration | normal | A→B 귓속말, 발신자 A 조회 → 자기 귓속말 보임 | `whisper-rls.test.ts` | RLS L93 `user_id=auth.uid()` 발신자 예외 |
| whisper-blocked-sender-hidden | integration | edge | A→B 귓속말 후 B가 A 차단 → B 조회시 A 메시지 안 보임 | `whisper-rls.test.ts` | RLS L92 `is_blocked_between`. 양방향 block. `whisper-blocked-recipient`도 동일 테스트에 통합 |
| whisper-full-chat-visible-despite-block | integration | edge | A 전체채팅(귓속말X), B가 A차단 → B에게 안 보임 | `whisper-rls.test.ts` | block은 전체메시지에 선적용(일관 모더레이션) |
| whisper-full-chat-visible-to-all | integration | normal | A 전체채팅(whisper_to=null), B/C/D 전원 보임 | `whisper-rls.test.ts` | RLS 비귓속말 baseline 회귀 |
| whisper-room-member-only | integration | edge | 비멤버 X가 방 메시지 SELECT → RLS 거절 | `whisper-rls.test.ts` | RLS L91 `room_is_member` 1차 게이트 |
| whisper-non-member-target-rejected | integration | edge | A→D(비멤버) 귓속말 → `invalid_whisper_target:not_member` | `__tests__/integration/send-message-rpc.test.ts` (추가) | RPC L34-38 |
| whisper-inactive-member-target-rejected | integration | edge | A→E(left 멤버) 귓속말 → `invalid_whisper_target:not_member` | `send-message-rpc.test.ts` (추가) | RPC L36 `status='active'` 요구 |
| whisper-blocked-target-rejected | integration | edge | A↔B 차단, A→B 귓속말 → `invalid_whisper_target:blocked` | `send-message-rpc.test.ts` (추가) | RPC L40-41 |
| whisper-create-mention-record | integration | normal | A→B 귓속말 후 message_mention(message_id,B) 행 생성 | `send-message-rpc.test.ts` (추가) | RPC L55-58 알림 인덱싱 |
| room-ended-send-message-error-code | integration | edge | status≠active 방에 sendRoomMessage → `room_not_active` 에러 | `send-message-rpc.test.ts` (추가) | RPC L24-26. 서버 게이트, mock 불가 |
| whisper-input-whitespace-trim | integration | edge | body=`'  hello  '` 전송 → DB에 `'hello'` 저장 | `send-message-rpc.test.ts` (추가) | RPC L15 `btrim` |
| integration-send-over-max | integration | edge | body=`'x'.repeat(501)` → `body_length`(22001) 거절 | `send-message-rpc.test.ts` (추가) | RPC L27. 클라/서버 게이트 동일 단위 확인 |
| integration-send-at-max | integration | edge | body=500자 전송 → 절단없이 500자 저장 | `send-message-rpc.test.ts` (추가) | RPC L27 경계 |
| room-ended-whisper-recipient-never-sees-ended | integration | normal | 방 종료 후 수신자 B가 과거 귓속말 여전히 조회 가능 | `whisper-rls.test.ts` | 종료가 과거 메시지 read 권한 회수 안 함 |
| room-ended-realtime-still-receives | integration | normal | status→ended 후에도 realtime 메시지 수신·머지 지속 | `__tests__/integration/room-status-realtime.test.ts` (신규) | chat.tsx L49 구독은 roomEnded 독립. 스트림 보존 |
| merge-whisper-visibility-third-party | unit | edge | selfId=me, msg={u1→u2} (둘다≠me) → drop | `lib/chat/__tests__/merge-whisper-filter.test.ts` (신규) | **고위험**. `useRoomChat.ts:61` 방어선 현재 0 테스트 |
| merge-whisper-visibility-self/sender | unit | normal | {u1→me} 보임, {me→u1} 보임 | 동상(신규) | L61 통과 케이스 2건 |
| merge-whisper-preserved-on-reconcile | unit | normal | tmp(whisperTo=u2)→server reconcile 후 whisperTo 유지 | `lib/chat/__tests__/message-merge.test.ts` (추가) | 가시성 제어 필드 보존 검증 |
| merge-userid-preserved-on-reconcile | unit | normal | tmp(userId=me)→server reconcile 후 userId 유지 | `message-merge.test.ts` (추가) | variant/아바타 선택 안정성 |
| merge-clientmsgid-collision-different-users | unit | edge | {s1,u1,c1} + 들어옴{s2,u2,c1} → 2행(매칭 안 함) | `message-merge.test.ts` (추가) | findIndex가 clientMsgId만 비교 → **잠재버그 노출**: 같은 c1 다른 user 오매칭 가능. 우선 검증 권장 |
| merge-partial-update-keep-unspecified | unit | normal | {s1,body:old,userId:u1}+{s1,body:new} → userId 유지 | `message-merge.test.ts` (추가) | spread 시맨틱 |
| merge-empty-list | unit | edge | list=[], incoming → length 1 | `message-merge.test.ts` (추가) | 첫 메시지 append |
| filter-candidates-empty-query | unit | edge | query=`''`(`@`만) → active 전원(self/blocked 제외) | `lib/chat/__tests__/mention.test.ts` (추가) | mention.ts L46 `q===''` 분기 |
| filter-candidates-case-insensitive | unit | edge | query=`'수A'`, name=`'수아'` → 매칭 | `mention.test.ts` (추가) | L46 `toLowerCase().startsWith` |
| resolve-ambiguous-homonyms | unit | edge | 정확query=`'수아'`인데 동명 2명 → `ambiguous`(완전일치라도) | `mention.test.ts` (추가) | L91 `length===1` 분기 미진입 → 안전 |
| filter-zero-active-members / all-left-or-blocked | unit | edge | members=[] 또는 전원 left/blocked → `[]` | `mention.test.ts` (추가) | 1인 방 방어 |
| parse-emoji-korean-combination | unit | edge | query=`'수🎉'` → `\S*` 토큰 처리 | `mention.test.ts` (추가) | 유니코드 엣지 |
| room-chat-view-mention-no-multiline | unit | edge | `'@수\n아'` → `\S+`가 `\n`서 멈춤(멀티라인 멘션 불가) | `mention.test.ts` (추가) | parseMentionQuery `\S*` 경계 |
| single-space / single-char / korean-single | unit | edge/normal | `' '`→false, `'a'`/`'한'`→true(len 1) | `lib/chat/__tests__/length.test.ts` (추가) | 최소 경계 명시 |
| leading-trailing-spaces / unit-trim-not-counted | unit | normal | `'   hello   '`/`'  a  '` → true(trim 후) | `length.test.ts` (추가) | isSendable trim 선적용 |
| emoji-basic-1char / emoji-complex-family | unit | normal/edge | `'😀'`→len 1, 가족이모지`'👨‍👩‍👧‍👦'`→7 code points | `length.test.ts` (추가) | spread `[...s]` code-point 계수 |
| over-max boundaries(501/1000) / mention-near-max | unit | edge | 501·1000→false, `'x'*497+' @민준'`(501)→false | `length.test.ts` (추가) | 멘션 토큰도 길이 산입 |
| is-near-bottom-boundary 119/120/121 | unit | edge | 119·120→true, 121→false | `lib/chat/__tests__/scroll.test.ts` (추가) | NEAR_BOTTOM_PX=120 정확 경계 |
| scroll-offset-negative/very-large | unit | edge | -5→true(방어적 `<=`), 999999→false | `scroll.test.ts` (추가) | 방어 코드 명시 |
| count-new-messages-empty-prev / bulk(100) / mixed-self-others / duplicate-ids | unit | edge/normal | prev=[]→정확수, 100건→100, self/타인 혼재→타인만, 중복id→1 | `scroll.test.ts` (추가) | Set 기반 dedup 카운트 |
| count-new-messages-deleted-not-tracked | unit | edge | 메시지 제거 시 음수 아닌 0 | `scroll.test.ts` (추가) | 삭제 비카운트 |
| room-ended-trailing-mention-stripped / body-preserved | component | normal | 방종료 시 `'hello @su'`→`'hello'`(본문보존, @만 strip) | `app/(app)/room/[roomId]/__tests__/chat.test.tsx` (신규, Jest) | chat.tsx L149 regex. "즉시 blank 금지" 회귀 |
| room-ended-mention-strip 엣지(`@`만/`@@user`/멀티라인/empty) | unit | edge | `'hello @'`→`'hello'`, `'@@user'`→strip, 멀티라인 tail만 | `lib/chat/__tests__/strip-tail.test.ts` (신규, strip 로직 export 시) | chat.tsx L149/L206 regex. export 안 돼있으면 chat.test.tsx로 |
| room-ended-stream/empty-state/jump-pill 보존 | component | normal | roomEnded=true에도 스트림·빈상태·pill 렌더 유지 | `components/chat/__tests__/RoomChatView.test.tsx` (추가) | roomEnded는 sendable만 게이트(L97) |
| room-ended-charcount-display-updated | component | normal | roomEnded=true에도 charcount 갱신 | `RoomChatView.test.tsx` (추가) | L200 charcount는 종료 무관 |
| whisper-mention-panel-excludes-blocked | component | edge | input=`'@수'`+blockedIds={u1}(u1=수아) → 패널 빈 candidates | `RoomChatView.test.tsx` (추가) | L86-88 blockedIds 경로 현재 미테스트(setup에 blockedIds 없음) |
| component-candidates-empty / panel-hidden-no-query | component | edge | input=`'@'` 후보없음/`''` → MentionAutocomplete 미노출 | `RoomChatView.test.tsx` (추가) | L189 `visible={candidates.length>0}` |
| whisper-send-state-recovery | component | edge | 내 귓속말 failed → retry 버튼 → onRetry(clientMsgId) | `RoomChatView.test.tsx` (추가) | variant=whisper+mine 재시도 경로 |
| header-members-visible / charcount-position / mention-panel-above-input | component | normal | KAV 레이아웃: 헤더/charcount/멘션패널 위치(키보드 위) | `RoomChatView.test.tsx` (추가) | KAV+SafeArea 배치 회귀(현재 존재만 검증) |
| photo-url-avatar-in-stack | component | normal | AvatarStack item.photoUrl → `av-photo` 렌더 | `packages/ui/src/primitives/__tests__/AvatarStack.test.tsx` (추가, 미staged) | RoomChatView L108→AvatarStack photoUrl 미테스트 |
| stream-tap-preserves-keyboard | component | normal | keyboardShouldPersistTaps='handled' 검증 | `RoomChatView.test.tsx` (추가) | L146. 작성 중 스크롤 키보드 유지 |
| e2e-whisper-confirmation-send + visibility | e2e-web | normal | @대상선택→전송→귓속말 버블, 3자 미노출(RLS-fetch) | `apps/mobile/e2e/playwright/specs/ch-whisper.spec.ts` (신규) | Task 7(하네스 재포인트) 의존. 대표 1 spec |
| e2e-compose-over-limit + exactly-500 | e2e-web | edge | 510자→send disabled, 500자→전송성공 | `ch-whisper.spec.ts` 또는 `ch2-room.spec.ts` (추가) | charcount 경계 UX |
| return-key-sends-message | e2e-web | normal | returnKeyType='send' 엔터 → onSend | `ch2-room.spec.ts` (추가) | InputBar 키 이벤트는 component fireEvent로 모델 불가 |

비고 — 권장 실행 순서: (1) `whisper-rls.test.ts`(integration)와 `merge-whisper-filter.test.ts`(unit)를 먼저 — CLAUDE.md 7/8/9항이 명시한 "mock으로 못 잡는 가시성·realtime" 핵심이며 머지 게이트 `integration` 단계가 CI에서 강제. (2) `merge-clientmsgid-collision-different-users`는 단순 회귀가 아니라 `message-merge.ts:20-24`의 findIndex가 user를 비교하지 않아 **다른 사용자의 동일 clientMsgId를 오매칭할 수 있는 잠재 결함**을 드러내므로 우선 확인 권장(RPC dedup 키는 `(room,user,client_msg_id)`이나 클라 merge는 user 무시). (3) integration 신규는 기존 `send-message-rpc.test.ts` 패턴(전용 `e2e-*@example.test` 유저 생성 → `try/finally` cleanup → user-JWT로 RPC 호출)을 그대로 따르되, CLAUDE.md 9항대로 최소 1개 핵심 flow는 `functions.invoke('send-message')` 경로(service_role/RPC 직접 우회 금지)로 호출해 Edge 배포·ES256 토큰 검증까지 관통할 것.

관련 파일(절대경로): 신규 `/Users/susan/personal/dei/apps/mobile/__tests__/integration/whisper-rls.test.ts`, `/Users/susan/personal/dei/apps/mobile/__tests__/integration/room-status-realtime.test.ts`, `/Users/susan/personal/dei/apps/mobile/lib/chat/__tests__/merge-whisper-filter.test.ts`, `/Users/susan/personal/dei/apps/mobile/app/(app)/room/[roomId]/__tests__/chat.test.tsx`, `/Users/susan/personal/dei/apps/mobile/e2e/playwright/specs/ch-whisper.spec.ts`; 추가 대상 `/Users/susan/personal/dei/apps/mobile/__tests__/integration/send-message-rpc.test.ts`, `/Users/susan/personal/dei/apps/mobile/lib/chat/__tests__/{mention,length,scroll,message-merge}.test.ts`, `/Users/susan/personal/dei/apps/mobile/components/chat/__tests__/RoomChatView.test.tsx`, `/Users/susan/personal/dei/packages/ui/src/primitives/__tests__/AvatarStack.test.tsx`.

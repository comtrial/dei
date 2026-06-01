# A→C 핸드오프 — 방 채팅(S13a)이 방/영상(S13·S14)과 공유하는 계약

> 작성: A(채팅, S13a 완료 — PR #41). 대상: C(방 S13·영상·S14·presence).
> 채팅과 방은 **같은 테이블·같은 realtime 채널·같은 RLS 게이트**를 공유한다.
> 아래는 C가 (1) 재사용할 것 (2) 반드시 맞출 것 (3) 건드리면 깨지는 것.

---

## 1. realtime 채널 규약 — `room:{roomId}` 단일 채널 (★중요)

`apps/mobile/lib/realtime.ts` 가 SSOT. **`room:` 문자열을 직접 쓰지 말고 헬퍼 경유.**

| export | 용도 | 소유 |
|---|---|---|
| `roomChannelName(roomId)` | 채널명 규약 | A |
| `roomChannel(roomId, selfUserId?)` | 채널 생성(미구독). presence key=selfUserId | A(규약), C(presence 구현) |
| `subscribeRoomMessages(roomId, onInsert)` | message INSERT 구독(채팅 수신) | A |
| `subscribeRoomStatus(roomId, onUpdate)` | **room UPDATE 구독(종료 감지) — 내가 새로 추가함** | A |

**C가 알아야 할 점:**
- presence(누가 방에 있나)·영상 신호는 **이 규약 위에** 구현해라. `roomChannel(roomId, selfUserId)` 로 presence key 를 박아 만들면 된다.
- ⚠️ **멀티 구독 주의:** 현재 채팅은 `subscribeRoomMessages` + `subscribeRoomStatus` 두 개가 각각 `roomChannel()` 을 호출 → `supabase.channel("room:{id}")` 가 **여러 인스턴스**로 뜬다. 여기에 C의 presence 구독까지 더하면 같은 topic 에 3+ 채널이 붙는다. supabase-js 에서 같은 topic 다중 채널 + 개별 `removeChannel` 은 구독 누수/조기 해제 footgun 이 있다.
  - **권장 합의안:** 방 화면(S13)이 떠 있는 동안 `room:{roomId}` **단일 채널 인스턴스를 공유**하고, 그 위에 `.on('postgres_changes', message)` + `.on('postgres_changes', room)` + `.on('presence', …)` 핸들러를 **함께** 붙이는 컨테이너 훅(예: `useRoomRealtime`)으로 통합하는 게 안전하다. 지금은 화면이 분리(S13 방 vs S13a 채팅 시트)돼 각자 구독 중이라 당장 충돌은 없지만, **C가 presence 를 같은 채널명으로 또 만들기 전에 나와 통합 방식을 맞추자.**
  - 최소한: 각 구독은 **반드시 cleanup 에서 반환된 unsubscribe 호출**(누수 방지). 헬퍼들은 이미 그렇게 반환한다.

---

## 2. RLS 단일 게이트 — `room_is_member` (C가 맞춰야 함)

방 도메인 모든 SELECT 는 `room_is_member(room_id, auth.uid())` 게이트를 통과한다(`20260529000020_rooms_v2_rls.sql`, A 고정). C의 S13(방)·S14(멤버)·video 조회도 이 게이트에 걸린다.

**C가 맞출 것:**
- **방 멤버십 = `room_member.status='active'` 가 진실.** 사용자가 방에 "있다"의 정의가 `room_is_member`(=active row 존재)다. C가 입장/퇴장/auto-kick 으로 `room_member.status` 를 바꾸면, **그 즉시 채팅 가시성·@후보·귓속말 대상 자격이 함께 바뀐다**(채팅이 같은 status 를 본다).
- video SELECT 정책(`video_select_member`)도 `room_is_member` 라 — C가 멤버를 `left` 로 바꾸면 그 사람은 영상도 채팅도 못 본다. 일관됨.
- **client 직접 mutation 금지(RLS 방어선).** 상태 전이는 RPC/Edge(security definer)로. 채팅은 `send_room_message` RPC + `send-message` Edge 로 한다. C의 방 상태 전이(입장/종료)도 같은 패턴(RPC/Edge)으로 해야 RLS 우회 안 된다.

---

## 3. 공유 테이블 — `room` / `room_member` / `message` (🔴 A 승인 필요)

C가 읽지만(R), 스키마 변경은 A 승인. 내가 S13a 로 **추가한 것**(C가 알아야 할 신규 컬럼/테이블):

- `message.client_msg_id uuid` + 부분 unique 인덱스 `(room_id,user_id,client_msg_id)` — 채팅 멱등 키. C는 안 건드림.
- `message.whisper_to_user_id` + self-whisper CHECK — 귓속말. **C가 "미읽음 dot" 카운트할 때 주의:** 귓속말은 RLS 가 발신자·대상에게만 보이므로, 미읽음 카운트도 `message_select_member` RLS 를 타면 자동으로 "나에게 보이는 것만" 집계된다(별도 필터 불필요).
- `push_token` 테이블(멘션 푸시) — C 무관.
- `room.status` ∈ {active, ended, deleted}, `room.ended_at`, `ended_reason` — **C가 소유(방 생명주기).** 채팅은 이 status 를 `subscribeRoomStatus` 로 구독해 종료 시 읽기전용 전환한다. **C가 방을 종료(status='ended')시키면 채팅이 자동으로 읽기전용+종료배너로 반응한다 — 별도 신호 줄 필요 없음.**

---

## 4. 채팅 진입점 — S13 헤더의 💬 아이콘 + 미읽음 dot (C 화면, A 라우팅 대상)

S13.md 가 선언한 대로 S13 방 헤더에 `IconButton(💬)` + `Badge(미읽음 dot)` 가 있고, 탭하면 S13a 채팅 시트로 진입한다.

**경계:**
- **라우팅:** S13(C) 💬 탭 → `/room/{roomId}/chat`(A). 라우트는 이미 존재.
- **미읽음 dot:** S13a.md 결정 = "숫자 X, 단순 dot". 카운트 소스 = `message` 테이블에서 내가 안 읽은 것. **read-state 테이블은 MVP 미도입**(채팅 dot 은 클라 로컬/단순 판정). C가 dot 을 message 카운트로 구현할 거면, 귓속말 가시성은 RLS 가 처리하니 그냥 SELECT count 하면 된다. **정교한 read receipt 가 필요하면 A와 협의**(스키마 추가 = A 승인).

---

## 5. 아바타 탭 → S14 프로필 (★C가 채워야 완성됨)

S13a 채팅 버블의 아바타를 탭하면 `/room/{roomId}/members?focus={userId}` 로 라우팅하도록 **A가 구현 완료**(PR #41). **그런데 목적지 S14(`members.tsx`)는 C 담당 placeholder 스텁이다.**

- **C가 할 일:** S14 가 `useLocalSearchParams` 로 `focus` 파라미터를 받아 **해당 userId 의 프로필을 보여주게** 구현. 지금은 탭하면 빈 스텁이 뜬다.
- profile 데이터: `profile` 테이블(authenticated SELECT 허용). 채팅이 멤버 닉네임/`photo_url` 을 이미 그렇게 조회 중(`room_member` ⨝ `profile`, FK 임베드 없어 2쿼리 결합).

---

## 6. 아바타 이미지 — `Avatar.photoUrl` (DS 신규, C도 재사용 가능)

`@dei/ui` `Avatar` 에 `photoUrl?: string` 추가함(expo-image 원형, 없으면 이니셜 폴백). C의 S13 GridRoom 셀·S14 ProfileHero·presence 아바타도 이걸로 프로필 사진 표시 가능. `ChatBubble` 은 `avatarPhotoUrl` + `onAvatarPress` 로 위임.

---

## 7. 한 줄 요약 — C가 꼭 맞출 것 3가지

1. **presence 를 같은 `room:{roomId}` 채널에 또 붙이기 전에 A와 채널 통합 방식 합의**(멀티 구독 footgun). 헬퍼 경유 + cleanup unsubscribe 필수.
2. **`room_member.status='active'` / `room.status='ended'` 가 채팅 가시성·종료를 자동 트리거한다** — C가 상태 바꾸면 채팅이 반응한다(별도 신호 불필요). 상태 전이는 RPC/Edge 로.
3. **S14 프로필 화면(`members.tsx`)이 `focus` 파라미터로 단일 프로필을 띄우게 구현**해야 채팅 아바타 탭이 완성된다.

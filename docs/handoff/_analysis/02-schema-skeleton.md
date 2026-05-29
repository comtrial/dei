충분한 컨텍스트를 확보했습니다. 기존 코드베이스의 모든 핵심 테이블/패턴/헬퍼를 파악했고, 새 과팅/방 도메인은 아직 미존재함을 확인했습니다. 이제 설계 핸드오프를 작성합니다.

---

# dei 신규 도메인(과팅/방) DB 스키마 골격 — A 핸드오프 (READ-ONLY 설계)

## 0. 기준선 (코드베이스 실측)

- 신규 도메인(team/room/match_queue 등)은 **아직 repo에 없음** — `supabase/migrations` 전수 grep 결과 미존재. greenfield.
- **재사용 가능한 기존 자산 (선례·헬퍼)**: `public.matches`(user_a/b_id + status ACTIVE/UNMATCHED), `public.conversations`(1:1, match당 1, status ACTIVE/ENDED/DELETED + realtime publication), `public.messages`(body 1..500, soft-delete, SENT), `public.blocks`(양방향, `unblocked_at` nullable), `public.reports`, `public.profiles`(PK=user_id), `public.payments` + `refresh_item_grants`(consumable: granted/remaining/status), `public.notifications`, `identity_verifications`, `profile_videos`.
- **재사용해야 할 헬퍼 (신규 생성 금지)**: `public.set_updated_at()` 트리거, `public.is_admin()`, `public.chat_is_blocked_between(a,b)` (security definer, 양방향 차단 평가). 방 RLS는 이 패턴을 **N명 멤버십으로 일반화**한다.
- **네이밍 일관성 규칙(기존 준수)**: PK `uuid default gen_random_uuid()`, FK는 `auth.users(id) on delete cascade`, `*_user_id`, `status text + check`, `created_at/updated_at timestamptz`, soft-delete는 `deleted_at`/`*_at nullable`.

> **핵심 설계 결정**: 1:1 채팅(`conversations`/`messages`)을 **재정의/마이그레이션하지 않는다**. 과팅 "방"은 N:N 그룹이므로 별도 `room` 트리로 신설하고, 1:1 채팅 코드는 그대로 둔다(충돌 회피, chat-spec 게이트 보존). 방 메시지는 `room` 전용 `message` 테이블을 쓰되 1:1 `messages`와 컬럼 패턴만 정렬.

## 1. 거버넌스 (A가 선제 고정 — 개발자 agent는 세부 필드만 디벨롭)

| 항목 | A가 고정하는 규칙 |
|---|---|
| **PK** | 전 테이블 `id uuid pk default gen_random_uuid()`. 단 1:1 매핑 테이블(profile류)은 `user_id` PK 허용. |
| **FK 정책** | 사람→`auth.users(id) on delete cascade`. 방/팀 하위(member/lifecycle/message)→부모 `on delete cascade`. 결제·감사 참조는 `on delete set null`(이력 보존). |
| **RLS 게이트 (방 도메인 단일 원칙)** | "**방 멤버십 기준**" = `public.room_is_member(room_id, auth.uid())` security-definer 헬퍼 1개로 모든 room 하위 테이블 SELECT 통제. 차단은 `chat_is_blocked_between` 확장(멤버 pairwise). admin 우회는 `is_admin()`. |
| **status enum** | 자유 text가 아니라 `check` 제약으로 도메인 고정 (matches/conversations 선례). |
| **realtime** | room/room_member/message만 `supabase_realtime` publication + `replica identity full` (1:1 채팅 선례 그대로). |
| **mutation 경로** | 클라 직접 INSERT 금지에 준함 → 상태 전이는 **Edge Function/RPC(security definer)** 단일 경로 (match_queue 매칭, room 생성, leave, payment grant). RLS는 방어선. |

## 2. 테이블별 골격

표기: **목적 / 핵심컬럼 / FK / RLS / 작업자(R=read,W=write)**. 🔴=공유 핵심·충돌 HIGH.

### 그룹 A. 사용자·신원
1. **`profile`** 🔴 (기존 `public.profiles` 재사용·확장, 신규 테이블 아님)
   - 목적: 사용자 공개 프로필 SSOT.
   - 핵심: 기존 `user_id`(PK), nickname/gender/region/photo + (신규 디벨롭 여지) `team_id` nullable 역참조는 두지 말고 team_member로 정규화.
   - FK: `user_id→auth.users`.
   - RLS: 기존 — 본인 write, authenticated read.
   - 작업자: **A·B·C 전부 R, 온보딩 W** → **🔴 충돌 HIGH** (스키마 변경은 A 승인 필수, 새 컬럼은 `add column if not exists` 멱등만).

2. **`auth_verification`** (기존 `identity_verifications` 재사용)
   - 목적: 본인인증(PortOne) 결과.
   - 핵심: provider/status/ci_hash/di_hash/adult_verified.
   - FK: `user_id→auth.users cascade`.
   - RLS: 본인 SELECT + service-role write. 작업자: **A R/W** (B·C 무관).

### 그룹 B. 팀(과팅 단위)
3. **`team`**
   - 목적: 과팅에 참가하는 사람 묶음(2~N인 그룹).
   - 핵심: `owner_user_id`, `name`, `gender`(팀 성별 — 매칭이 반대 성별 팀 매칭), `size`(목표 인원), `status`(`FORMING`/`READY`/`MATCHING`/`LOCKED`/`DISBANDED`).
   - FK: `owner_user_id→auth.users cascade`.
   - RLS: 멤버만 SELECT (`team_is_member`), owner만 일부 전이. 작업자: **A W, B R**.

4. **`team_invite`**
   - 목적: 팀원 초대 토큰/상태.
   - 핵심: `team_id`, `inviter_user_id`, `invitee_user_id`(nullable)/`invite_code`, `status`(`PENDING`/`ACCEPTED`/`DECLINED`/`EXPIRED`), `expires_at`.
   - FK: `team_id→team cascade`, user→`auth.users`.
   - RLS: 초대자/피초대자/팀멤버 SELECT. 수락은 RPC. 작업자: **A W, B R**.

> team의 실제 인원 행은 아래 **match_member/room_member** 와 구분 — 팀 확정 인원은 `team_member`가 필요할 수 있으나, A-3 목록에 없으므로 **team_invite의 ACCEPTED 집합**으로 팀원 도출(개발자가 team_member 정규화 테이블 승격 여부 결정). 골격에선 placeholder 주석.

### 그룹 C. 매칭
5. **`match_queue`**
   - 목적: 매칭 대기열 — 매칭 가능한 팀(또는 1인팀) 큐잉.
   - 핵심: `team_id`, `gender`, `desired_size`, `region`(필터), `status`(`WAITING`/`MATCHED`/`CANCELLED`/`EXPIRED`), `enqueued_at`, `expires_at`.
   - FK: `team_id→team cascade`.
   - RLS: 팀 멤버 SELECT 본인 큐만; enqueue/dequeue는 RPC. 작업자: **B W, C R(매칭 결과 소비)**.

6. **`match`** 🔴 (기존 `public.matches`와 **이름 충돌** — 신규는 **`group_match`** 로 분리 권고)
   - 목적: 두 팀이 성사된 과팅 매칭 1건. (기존 1:1 `matches`는 좋아요 파이프라인 전용이라 **재사용 불가** — 컬럼 `user_a/b_id` 2인 전제.)
   - 핵심: `team_a_id`, `team_b_id`, `status`(`ACTIVE`/`ENDED`/`CANCELLED`), `matched_at`, canonical order (`team_a_id < team_b_id`) + pair unique.
   - FK: `team_a_id`/`team_b_id→team`.
   - RLS: 양 팀 멤버 SELECT (`group_match_is_member`). 생성은 매칭 RPC. 작업자: **C W, B·room생성 R** → **🔴 충돌 HIGH** (기존 `matches`와 동명 회피 결정·canonical order·차단 게이트가 cross-cutting).

7. **`match_member`**
   - 목적: 한 매칭에 속한 개별 참가자(양 팀 멤버 펼침) — 방 멤버십 시드.
   - 핵심: `match_id`(group_match), `team_id`, `user_id`, `side`(A/B).
   - FK: `match_id→group_match cascade`, `user_id→auth.users cascade`.
   - RLS: 같은 match_member 집합에 속하면 SELECT. 작업자: **C W, room R**.

### 그룹 D. 방(대화 공간)
8. **`room`** 🔴
   - 목적: 성사된 매칭의 그룹 대화방 (N명). 1:1 `conversations`의 그룹 일반화.
   - 핵심: `match_id`(group_match, unique), `status`(`ACTIVE`/`ENDED`/`DELETED` — conversations 선례), `last_message_preview`/`last_message_at`(목록 정렬), `created_at`/`updated_at`.
   - FK: `match_id→group_match cascade`.
   - RLS: `room_is_member(id, auth.uid())` AND not-blocked-between-members. realtime ON. 작업자: **A·B·C 다수 R, room 생성 RPC W** → **🔴 충돌 HIGH** (목록·게이트·생성·종료 cross-cutting; 1:1 chat-spec 게이트와 패턴 정합 유지).

9. **`room_member`** 🔴
   - 목적: 방 참가자 + per-member 상태(읽음/나감/뮤트).
   - 핵심: `room_id`, `user_id`, `team_side`, `joined_at`, `left_at`(nullable, soft-leave), `last_read_at`, `role`(owner/member).
   - FK: `room_id→room cascade`, `user_id→auth.users cascade`. unique(`room_id`,`user_id`).
   - RLS: 같은 room 멤버면 SELECT(상대 멤버 가시), 본인 행만 UPDATE(읽음/나감). 작업자: **A·B·C R, 본인 W** → **🔴 충돌 HIGH** (`room_is_member`의 정의 원천 — 모든 RLS가 이 테이블 참조).

10. **`room_lifecycle`**
    - 목적: 방 상태 전이 이벤트 이력(생성/종료/전원나감/만료).
    - 핵심: `room_id`, `event`(`CREATED`/`ENDED`/`MEMBER_LEFT`/`EXPIRED`/`DISBANDED`), `actor_user_id`(nullable), `metadata jsonb`, `created_at`.
    - FK: `room_id→room cascade`, actor→`auth.users set null`.
    - RLS: 방 멤버 SELECT, 시스템 write. 작업자: **B/C W(전이 RPC), A R(감사)**.

### 그룹 E. 미디어
11. **`video`** (기존 `profile_videos`/`logs` 재사용 검토 — room 내 영상이면 신규)
    - 목적: 프로필/방에 첨부되는 영상 메타.
    - 핵심: `owner_user_id`, `storage_bucket`/`storage_path`, `duration_ms`, `moderation_status`, `room_id`(nullable, 방 첨부 시).
    - FK: owner→`auth.users cascade`, `room_id→room set null`.
    - RLS: 본인 또는 같은 방 멤버 SELECT (chat의 `profile_images_visible_to_chat_peer` 선례). 작업자: **A W, room R**.

12. **`upload`**
    - 목적: 업로드 세션/진행 추적 (Storage 직업로드 메타).
    - 핵심: `user_id`, `bucket`/`path`, `status`(`PENDING`/`COMPLETED`/`FAILED`), `kind`(profile/room-video).
    - FK: `user_id→auth.users cascade`.
    - RLS: 본인만. 작업자: **A W**.

### 그룹 F. 메시지
13. **`message`** (room 전용 — 1:1 `public.messages`와 **분리**, `room_message` 권고)
    - 목적: 방 그룹 메시지 1건. body 1..500, soft-delete(`deleted_at`), `status='SENT'`.
    - 핵심: `room_id`, `sender_user_id`, `body`, `status`, `deleted_at`, `created_at`. (1:1 messages 컬럼 패턴 정렬, FK만 room으로.)
    - FK: `room_id→room cascade`, sender→`auth.users cascade`.
    - RLS: room 멤버 + room ACTIVE + 미차단 SELECT/INSERT (chat-spec `messages_*` 정책 일반화). realtime ON. 작업자: **B·C R/W**.

14. **`mention`**
    - 목적: 방 메시지 내 멘션(@user) 인덱스 — 알림 트리거용.
    - 핵심: `message_id`, `mentioned_user_id`.
    - FK: `message_id→room_message cascade`, user→`auth.users cascade`.
    - RLS: 방 멤버 SELECT. 작업자: **B W, notification C R**.

> **DM(direct_message)** — **이번 범위 밖. 미구현.** 별도 화면·별도 작업 트랙. 골격에 테이블 생성하지 않음. placeholder 주석으로만 남김:
> ```sql
> -- TODO(out-of-scope): direct_message — 1:1 다이렉트 메시지(방과 무관, 별도 화면).
> --   이번 핸드오프 범위 아님. 기존 public.messages(1:1 chat)와도 별개 트랙.
> --   설계·테이블 생성 금지 — 전용 작업에서 신설.
> ```

### 그룹 G. 안전(차단·신고)
15. **`block`** (기존 `public.blocks` 재사용)
    - 목적: 양방향 차단. 방 가시성·메시지 게이트의 입력.
    - 핵심: 기존 `blocker_user_id`/`blocked_user_id`/`unblocked_at`.
    - FK: 둘 다 `auth.users cascade`.
    - RLS: 본인 차단행만. 작업자: **A·B·C R(게이트), 본인 W**. (room_is_member와 결합해 차단 평가 — 헬퍼 확장은 A.)

16. **`report`** (기존 `public.reports` 재사용·확장)
    - 목적: 사용자/방/메시지 신고.
    - 핵심: 기존 reporter/reported + (신규 디벨롭) `room_id` nullable, `message_id` nullable.
    - FK: room/message→`set null`(이력보존), user→cascade.
    - RLS: 신고자 본인 INSERT/SELECT, admin all. 작업자: **A W, admin R**.

### 그룹 H. 결제·면제권
17. **`payment`** 🔴 (기존 `public.payments` 재사용)
    - 목적: 결제 트랜잭션 SSOT(IAP/PG).
    - 핵심: 기존 `product_type`/`amount`/`결제상태`/`external_tx_id`.
    - FK: `user_id→auth.users cascade`.
    - RLS: 본인 SELECT, webhook(service-role) write. 작업자: **A·결제 W, C(매칭 자격 체크) R** → **🔴 충돌 HIGH** (스키마 SSOT, webhook 멱등·환불 cross-cutting).

18. **`pass` (면제권)** (기존 `refresh_item_grants` 패턴 차용한 신규)
    - 목적: 구매로 지급되는 소모성 권한(과팅 입장권/면제권). consumable.
    - 핵심: `user_id`, `payment_id`, `pass_type`, `granted_count`/`remaining_count`, `status`(`AVAILABLE`/`CONSUMED`/`REVOKED`), `granted_at`/`consumed_at`. (refresh_item_grants count-check 선례 복제.)
    - FK: `user_id→auth.users cascade`, `payment_id→payment cascade`.
    - RLS: 본인 SELECT, consume는 RPC(security definer, race-safe `for update`). 작업자: **A W(grant), C R(소비)**.

### 그룹 I. 설정·운영
19. **`notification_setting`**
    - 목적: 사용자별 알림 on/off (방 메시지/멘션/매칭).
    - 핵심: `user_id`(PK), `room_message_enabled`/`mention_enabled`/`match_enabled` bool, `push_token` 연동은 기존 `user_devices` 참조.
    - FK: `user_id→auth.users cascade`.
    - RLS: 본인만. 작업자: **A W**. (실제 발송 알림 행은 기존 `public.notifications` 재사용.)

20. **`refund_ticket`**
    - 목적: 환불 요청/처리 워크플로.
    - 핵심: `payment_id`, `user_id`, `status`(`REQUESTED`/`APPROVED`/`REJECTED`/`DONE`), `reason`, `resolved_at`.
    - FK: `payment_id→payment set null`(이력), `user_id→auth.users cascade`.
    - RLS: 본인 SELECT/INSERT, admin 처리. 작업자: **A W, admin R/W**.

21. **`audit`** (기존 `public.audit_log`/`admin_actions` 재사용 검토)
    - 목적: 민감 전이(매칭 강제종료, 환불, 차단) 감사 로그.
    - 핵심: `actor_user_id`/`actor_type`, `action`, `target_type`/`target_id`, `metadata jsonb`, `created_at`.
    - FK: actor→`set null`.
    - RLS: admin SELECT only, service-role write. 작업자: **전 작업자 W(전이 시), admin R**.

## 3. 작업자 경계 요약 (충돌 HIGH 테이블 — A 선제 거버넌스 대상)

| 테이블 | 작업자 | 충돌 |
|---|---|---|
| `profile` | A·B·C R / 온보딩 W | 🔴 HIGH |
| `room` | A·B·C R / RPC W | 🔴 HIGH |
| `room_member` | A·B·C R / 본인 W | 🔴 HIGH (`room_is_member` 원천) |
| `group_match`(=A-3 "match") | C W / B·room R | 🔴 HIGH (기존 `matches` 동명 회피) |
| `payment` | A·결제 W / C R | 🔴 HIGH |

이 5개는 **단일 마이그레이션 소유자(A)** 가 PK/FK/RLS/헬퍼를 먼저 고정한 뒤 B·C가 컬럼만 멱등 추가(`add column if not exists`)하는 규약으로 충돌을 차단한다.

## 4. A가 이번 핸드오프에서 선제 정의해야 할 3개 헬퍼 (DDL 전 PK 확인 규칙 적용 대상)

```sql
-- room 멤버십 판정 (모든 room 하위 RLS의 SSOT). security definer.
public.room_is_member(p_room_id uuid, p_user_id uuid) returns boolean
-- 방 멤버 간 양방향 차단 (chat_is_blocked_between 의 N명 일반화).
public.room_has_block(p_room_id uuid) returns boolean
-- group_match(팀 매칭) 멤버십.
public.group_match_is_member(p_match_id uuid, p_user_id uuid) returns boolean
```
기존 `set_updated_at()`/`is_admin()` 재사용. **신규 헬퍼 생성 전 DDL 체크리스트(PK/NOT NULL/인덱스/FK/DEFAULT/타입·길이/네이밍)** 는 각 테이블 마이그레이션 작성 단계에서 개발자 agent가 통과시킨다.

## 5. 발견한 충돌·주의 (개발자 agent에게 전달)

- **이름 충돌 (CRITICAL)**: A-3의 `match`/`message`는 기존 `public.matches`(1:1 좋아요)·`public.messages`(1:1 채팅)와 **동명이지만 카디널리티가 다름**(2인 vs N인). 재정의·alter 금지. 신규는 `group_match`/`room_message` 로 분리해야 chat-verify 게이트(branch protection)가 안 깨진다.
- **realtime publication**: room/room_member/room_message 3개만 추가. 1:1 채팅이 이미 `supabase_realtime`에 conversations/messages를 넣었으므로 중복 add 시 `duplicate_object` exception 핸들링(선례 라인 245-259) 복제.
- **DM은 미구현 placeholder** — 테이블/RLS/RPC 일절 생성 금지.

관련 파일(절대경로): `/Users/susan/personal/dei/supabase/migrations/20260516120000_chat_conversations_messages.sql`(room/RLS/RPC 직접 선례), `/Users/susan/personal/dei/supabase/migrations/20260507120000_member_onboarding_compatibility.sql`(profiles 확장·blocks·identity·profile_videos), `/Users/susan/personal/dei/supabase/migrations/20260508120000_paid_refresh_iap_foundation.sql`(consumable=pass 패턴), `/Users/susan/personal/dei/supabase/migrations/20260506140823_admin_console_extension_tables.sql`(profiles/payments/reports 원본), `/Users/susan/personal/dei/docs/DB_스키마.md`(logs/likes/daily_logs).
# Rooms-Pivot DB 설계 (Phase 0.4)

> 새 도메인의 Supabase Postgres 스키마. 이 문서는 Phase 2 의 베이스라인
> 마이그레이션(`20260526000000_rooms_v1_baseline.sql`) 의 single source of truth.

## ERD 개요 (텍스트)

```
profiles (KEEP, 확장)
├─ nickname unique (D4)
├─ quiet_hours_start/end (D3)
└─ is_adult (D1)

groups          ─< group_members >─ profiles
   │                                  │
   └────< match_queue >───────────────┤
                │                     │
                ▼                     │
              rooms ──< room_members >┘
                ├─ hourly_uploads
                ├─ chat_messages ──< chat_mentions
                ├─ room_auto_kicks
                └─ room_leave_cooldowns

blocks (양방향, 영구)
reports (큐)
rematch_exclusions (재매칭 제외)
booster_grants (BM)
notification_logs (8종 알림)
```

---

## 테이블 정의 (CREATE TABLE 의도)

### profiles (기존 → 확장)

```sql
-- 기존 컬럼 보존 (id, gender, birth_date, nickname, ...)
-- 새 도메인용 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nickname_lower TEXT GENERATED ALWAYS AS (lower(nickname)) STORED,
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT NOT NULL DEFAULT 0,  -- 0~23 (KST)
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS is_in_active_room BOOLEAN NOT NULL DEFAULT false,  -- D4 가용성 체크용 캐시
  ADD COLUMN IF NOT EXISTS last_room_leave_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_lower_uniq
  ON profiles(nickname_lower)
  WHERE deleted_at IS NULL;
```

### groups (묶음 = 총대 + 친구 닉네임 초대)

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  size SMALLINT NOT NULL CHECK (size BETWEEN 1 AND 4),  -- 본인 포함
  status TEXT NOT NULL CHECK (status IN ('forming','queued','matched','disbanded')) DEFAULT 'forming',
  matched_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disbanded_at TIMESTAMPTZ
);

CREATE INDEX groups_leader_status_idx ON groups(leader_id, status);
```

### group_members (묶음 ↔ profiles)

```sql
CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader','member')) DEFAULT 'member',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);

CREATE INDEX group_members_profile_idx ON group_members(profile_id);
```

### match_queue (매칭 대기)

```sql
CREATE TABLE match_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE UNIQUE,
  submitter_gender TEXT NOT NULL CHECK (submitter_gender IN ('male','female','other')),
  desired_opponent_gender TEXT NOT NULL CHECK (desired_opponent_gender IN ('male','female','other')),
  age_range_min SMALLINT,
  age_range_max SMALLINT,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ  -- 매칭 성사 후 set
);

CREATE INDEX match_queue_open_idx ON match_queue(desired_opponent_gender, enqueued_at)
  WHERE consumed_at IS NULL;
```

### rooms (매칭된 방)

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('active','ended','archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),  -- D6
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,  -- 'expired'|'all_members_left'|'admin'
  member_count SMALLINT NOT NULL DEFAULT 0,  -- 캐시
  active_member_count SMALLINT NOT NULL DEFAULT 0  -- 캐시 (auto_kicked/left 제외)
);

CREATE INDEX rooms_active_idx ON rooms(status, expires_at) WHERE status = 'active';
```

### room_members (방 ↔ profiles)

```sql
CREATE TABLE room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,  -- 어느 묶음에서 왔는지
  status TEXT NOT NULL CHECK (status IN ('active','left','auto_kicked')) DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, profile_id)
);

CREATE INDEX room_members_profile_active_idx ON room_members(profile_id, status)
  WHERE status = 'active';
```

### hourly_uploads (3초 영상)

```sql
CREATE TABLE hourly_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,   -- e.g. 'rooms/<roomId>/<profileId>/<uploadId>.mp4'
  thumbnail_path TEXT,
  duration_ms SMALLINT NOT NULL CHECK (duration_ms BETWEEN 500 AND 3500),
  hour_slot SMALLINT NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),  -- KST 슬롯
  slot_date DATE NOT NULL,  -- KST 날짜
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,  -- 방 종료 시 set
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),  -- D8
  CONSTRAINT one_upload_per_hour_slot
    UNIQUE (profile_id, room_id, slot_date, hour_slot)
);

CREATE INDEX hourly_uploads_room_recent_idx ON hourly_uploads(room_id, uploaded_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX hourly_uploads_blur_gate_idx ON hourly_uploads(profile_id, room_id, uploaded_at DESC);
```

### chat_messages (방 단위 채팅)

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- soft delete (운영 처리용)
);

CREATE INDEX chat_messages_room_recent_idx ON chat_messages(room_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

### chat_mentions (@닉네임 귓속말 라우팅)

```sql
CREATE TABLE chat_mentions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  mentioned_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, mentioned_profile_id)
);

CREATE INDEX chat_mentions_profile_idx ON chat_mentions(mentioned_profile_id);
```

> **Note**: PRD "@멘션 = 귓속말" 의미는 두 가지 해석 가능 — (a) 멘션된 멤버에게 push 알림만 추가
> (b) 멘션된 멤버만 메시지가 보임(나머지는 안 보임). MVP 는 **(a) push 알림 추가만**.
> (b) 는 RLS 가 복잡해지고 그룹 채팅 본질에 어긋남.

### blocks (영구 양방향 차단)

```sql
CREATE TABLE blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX blocks_blocked_idx ON blocks(blocked_id);

-- 양방향 조회 view (RLS 정책에서 사용)
CREATE VIEW v_block_pairs AS
  SELECT blocker_id AS a, blocked_id AS b FROM blocks
  UNION
  SELECT blocked_id AS a, blocker_id AS b FROM blocks;
```

### reports (신고 큐)

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN
    ('verbal_abuse','spam','fake_profile','inappropriate_video','harassment','other')),
  reason_detail TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','under_review','resolved','dismissed')) DEFAULT 'open',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reason_detail_required_for_other
    CHECK (reason_code <> 'other' OR (reason_detail IS NOT NULL AND length(trim(reason_detail)) > 0))
);

CREATE INDEX reports_status_idx ON reports(status, created_at DESC);
CREATE INDEX reports_reported_idx ON reports(reported_id);
```

### room_auto_kicks (자동 퇴장 이력)

```sql
CREATE TABLE room_auto_kicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  kicked_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocks_count SMALLINT NOT NULL,
  total_members SMALLINT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX room_auto_kicks_unique ON room_auto_kicks(room_id, kicked_profile_id);
```

### rematch_exclusions (재매칭 제외 — 그림 C)

```sql
-- 단순화: blocks 테이블 + group 멤버 시점에 동적 계산.
-- 별도 캐시 테이블 불필요. 매칭 엔진/RPC 가 매번 v_block_pairs 와 group_members JOIN.
-- (PRD 9장의 "rematch_exclusions" 는 개념적 명칭, 물리 테이블은 안 만듦)
```

> **결정:** 별도 `rematch_exclusions` 테이블 안 만듦. `blocks` 가 영구 양방향이고
> 매칭 시점에 `group_members` 와 JOIN 으로 충분히 빠름 (인덱스 잘 잡으면).
> 과적 시 view materialized 로 전환 가능.

### room_leave_cooldowns (방 이탈 후 24h 제한)

```sql
CREATE TABLE room_leave_cooldowns (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  cooldown_until TIMESTAMPTZ NOT NULL,
  source_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **갱신 정책:** 방 이탈 시 `cooldown_until = now() + 24h`. 부스터 소비 시 `DELETE`.

### booster_grants (즉시 재매칭 부스터)

```sql
CREATE TABLE booster_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('purchase','free_grant_female','promo','refund')),
  product_id TEXT NOT NULL,  -- 'booster_instant_rematch_v1'
  revenuecat_transaction_id TEXT UNIQUE,  -- 구매 시
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  consumed_for_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX booster_grants_available_idx ON booster_grants(profile_id, granted_at)
  WHERE consumed_at IS NULL;
```

### notification_logs (감사용 — 새 도메인)

```sql
-- 기존 notifications 테이블 활용. 새 type enum 추가만:
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'room_matched';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'hourly_upload_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'blur_gate_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'blur_gate_reapplied';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'chat_mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'room_left';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rematch_available';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'booster_offer';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'room_auto_kicked';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'room_member_kicked';
-- 옛 enum (like_received, match_created, dm_received) 은 새 베이스라인에서 drop
```

---

## RLS 정책 (핵심 — Phase 2에서 정밀 작성)

### profiles
- `SELECT`: 본인 모든 컬럼 + 같은 방 멤버는 닉네임/사진/성별만 (`v_room_visible_profiles` view)
- `UPDATE`: 본인 nickname / quiet_hours 등 일부 컬럼만

### groups / group_members
- `SELECT`: 본인이 leader 이거나 member 인 groups 만
- `INSERT`: 본인을 leader 로 한 groups + 자신을 leader 로 member 등록 (RPC `create_group` 으로만)
- `UPDATE/DELETE`: leader 본인만 (status='forming' 일 때만)

### match_queue
- `SELECT`: 본인이 leader 인 group 의 queue 항목만
- `INSERT`: RPC `enqueue_group_for_match` 통해서만 (그룹 가용성 D4 체크)
- `DELETE`: leader 본인만 (consumed_at IS NULL 일 때만)

### rooms
- `SELECT`: 본인이 active member 인 방만 (`room_members.profile_id = auth.uid()` AND `status='active'`)
- `INSERT/UPDATE`: service_role 만 (운영진 또는 Edge Function)

### room_members
- `SELECT`: 같은 방 멤버 본인 + 다른 멤버의 row (단, 본인이 차단한 멤버는 제외 — `v_block_pairs` LEFT JOIN)
- `INSERT/UPDATE`: service_role 만

### hourly_uploads
- `SELECT`:
  - 본인 업로드 항상 보임
  - **블러 게이트**: 같은 방 다른 멤버 업로드는 본인이 24h 내 업로드 1개라도 있어야 보임
  - 차단 관계 양방향 숨김 (`v_block_pairs` 체크)
- `INSERT`: RPC `upload_hourly_video` 로만 (slot_date/hour_slot 검증 + slot 중복 거부)

### chat_messages
- `SELECT`: 같은 방 active member + 차단 양방향 숨김
- `INSERT`: RPC `send_chat_message` 로만 (멘션 파싱 + 멘션 row 동시 생성 + push 트리거)
- `UPDATE`: 본인 author + deleted_at 만 set (소프트 삭제, MVP 미노출)

### blocks
- `SELECT`: 본인이 blocker_id 인 row 만
- `INSERT`: RPC `block_user` 통해서만 (자기 자신 거부, 트랜잭션 내 자동 퇴장 임계값 체크)
- `DELETE`: **불가** (D 영구)

### reports
- `SELECT`: 본인이 reporter_id 인 row 만
- `INSERT`: RPC `report_user` 통해서만 (reason_code 검증)
- `UPDATE`: service_role 만 (운영팀)

### room_auto_kicks / room_leave_cooldowns
- `SELECT`: 본인 관련 row 만
- `INSERT/DELETE`: service_role 만

### booster_grants
- `SELECT`: 본인 grant 만
- `INSERT`: RPC `grant_booster_*` 또는 webhook 만
- `UPDATE`: RPC `consume_booster_grant` 로만 (consumed_at set)

---

## RPC 함수 목록

| 이름 | 호출 주체 | 책임 |
|---|---|---|
| `create_group(nicknames TEXT[])` | 클라 | leader=auth.uid, member 닉네임 검색, 모두 가입자인지 검증, group + group_members 생성 |
| `disband_group(group_id UUID)` | 클라 | leader 본인이고 status='forming' 일 때 disbanded |
| `enqueue_group_for_match(group_id UUID)` | 클라 | leader 본인 + 모든 멤버가 다른 방 사용 중 아님 확인 (D4) + match_queue 적재 |
| `admin_create_room(group_ids UUID[])` | service_role | 운영진 편성: 후보 묶음들로 새 room + room_members 생성 + match_queue.consumed_at 갱신 |
| `upload_hourly_video(room_id, storage_path, hour_slot, slot_date)` | Edge Function | active member + slot 중복 거부 + hourly_uploads insert |
| `send_chat_message(room_id, body)` | Edge Function | active member + body 길이 검증 + 멘션 파싱(`@(\w+)`) + chat_messages + chat_mentions 동시 insert + return new id |
| `block_user(blocked_id, source_room_id?)` | Edge Function | blocks insert + (room 컨텍스트면) 임계값 체크 → room_auto_kicks insert + room_members.status='auto_kicked' |
| `report_user(reported_id, reason_code, reason_detail?, room_id?)` | Edge Function | reports insert |
| `leave_room(room_id)` | Edge Function | room_members.status='left' + room_leave_cooldowns upsert + active_member_count 갱신 + (0 도달 시 room 종료) |
| `grant_free_booster_for_female()` | 클라/cron | 본인이 여성이고 cooldown 있을 때 무료 booster_grants 생성 |
| `consume_booster_grant()` | Edge Function | 사용 가능한 grant 1개 consume + room_leave_cooldowns 삭제 |
| `evaluate_blur_gate(room_id)` | view 또는 RPC | 본인이 24h 내 업로드 있는지 boolean 반환 (UI 가시성 결정용) |

---

## Storage 버킷

| 버킷 | 용도 | RLS |
|---|---|---|
| `logs` (기존) | 본인 프로필 영상 (KEEP) | 기존 정책 KEEP |
| `room-uploads` (신규) | 방 단위 3초 영상 | 같은 방 active member + 차단 양방향 숨김 + 블러 게이트 |
| `room-thumbnails` (신규) | 위의 썸네일 | 동일 정책 |

> Storage 정책은 SQL 로 정의 (`storage.policies` 테이블).

---

## 마이그레이션 파일 계획

```
supabase/migrations/
├── (KEEP) 20260506* ~ 20260525* 중 KEEP 표기된 파일들
├── 20260526000000_rooms_v1_baseline.sql        # 본 설계 전체 (테이블 + RLS + RPC)
├── 20260526000010_drop_legacy_curation_chat.sql # 옛 도메인 테이블 drop
├── 20260526000020_storage_buckets_room_uploads.sql
└── 20260526000030_notification_types_v2.sql    # enum 갱신
└── 20260526000040_seed_dev_users_for_rooms.sql  # 로컬 dev 시드
└── migrations_legacy/pre_rooms_pivot_20260525/
    └── (인벤토리의 REMOVE 표기 SQL 파일들 이관)
```

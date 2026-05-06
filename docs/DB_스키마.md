# DB 스키마 정리

> 마이그레이션 기준일: 2026-05-03  
> 마이그레이션 파일: `supabase/migrations/20260503000001_create_logs_table.sql`, `20260503000002_create_curation_pool.sql`, `20260503000003_likes_and_pool_rls.sql`

---

## 테이블

### `public.curation_pool`

홈 화면 큐레이션 대상 풀. 관리자가 검수 완료한 로그를 날짜별로 등록.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | NOT NULL, FK → `auth.users.id` ON DELETE CASCADE | 영상 주인 |
| `log_id` | `uuid` | — | NOT NULL, FK → `logs.id` ON DELETE CASCADE | 노출 대상 로그 |
| `pool_date` | `date` | — | NOT NULL, UNIQUE with `user_id` | 큐레이션 날짜 |
| `검수_YN` | `char(1)` | `'N'` | NOT NULL, `'Y'` or `'N'` | 관리자 검수 완료 여부 |
| `차단_YN` | `char(1)` | `'N'` | NOT NULL, `'Y'` or `'N'` | 차단 여부 |
| `video_path` | `text` | — | — | Supabase Storage 경로 (퍼블릭 URL 생성에 사용) |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**RLS 정책**

| 정책 | 대상 | 조건 |
|------|------|------|
| `authenticated users can read curation pool` | SELECT | `true` (인증된 유저 전체 읽기) |

**홈 화면 조회 조건**

```sql
SELECT * FROM curation_pool
WHERE pool_date    = :poolFetchDate   -- 정오 이전: 어제 / 정오 이후: 오늘
  AND user_id     != :currentUserId
  AND 검수_YN      = 'Y'
  AND 차단_YN      = 'N'
```

풀 3명 이상 → H2 정상 큐레이션 / 3명 미만 → H3 빈 상태

---

### `public.logs`

유저가 촬영한 영상 클립 1건 = 1행.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | NOT NULL, FK → `auth.users.id` ON DELETE CASCADE | |
| `video_url` | `text` | — | NOT NULL | Supabase Storage 경로 (`{user_id}/{timestamp}.mp4`) |
| `hour_slot` | `smallint` | — | NOT NULL, 0–23 | 촬영 완료 시점의 시(hour) |
| `duration_sec` | `smallint` | — | NOT NULL | 영상 길이(초) |
| `검수_YN` | `char(1)` | `'N'` | NOT NULL, `'Y'` or `'N'` | 관리자 검수 완료 여부 |
| `검수_상태` | `text` | `'PENDING'` | NOT NULL, `'PENDING'` / `'APPROVED'` / `'REJECTED'` | 관리자 검수 상태 |
| `recorded_at` | `timestamptz` | — | NOT NULL | 촬영 완료 시각 (클라이언트 `new Date().toISOString()`) |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**RLS 정책**

| 정책 | 대상 | 조건 |
|------|------|------|
| `users can insert own logs` | INSERT | `user_id = auth.uid()` |
| `users can read own logs` | SELECT | `user_id = auth.uid()` |

**Storage 버킷**: `logs`  
업로드 경로: `{user_id}/{Date.now()}.mp4`

---

### `public.daily_logs`

유저별 날짜별 데일리 로그 달성 상태. `recalculate_daily_log` RPC가 자동 관리.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | NOT NULL, FK → `auth.users.id` ON DELETE CASCADE | |
| `log_date` | `date` | — | NOT NULL, UNIQUE with `user_id` | |
| `status` | `text` | `'INCOMPLETE'` | NOT NULL, `'INCOMPLETE'` / `'COMPLETED'` | |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |
| `updated_at` | `timestamptz` | `now()` | NOT NULL | RPC 호출마다 갱신 |

**RLS 정책**

| 정책 | 대상 | 조건 |
|------|------|------|
| `users can read own daily logs` | SELECT | `user_id = auth.uid()` |

---

## 함수

### `public.recalculate_daily_log(p_user_id uuid)`

`logs` INSERT 후 클라이언트에서 호출. `daily_logs`의 오늘 행을 UPSERT.

```
서로 다른 hour_slot 수 >= 3  →  status = 'COMPLETED'
서로 다른 hour_slot 수 < 3   →  status = 'INCOMPLETE'
```

- `SECURITY DEFINER`: RLS를 우회해 `daily_logs` 쓰기 가능
- 중복 호출 안전: `ON CONFLICT DO UPDATE`

**호출 예시 (클라이언트)**

```ts
await supabase.rpc('recalculate_daily_log', { p_user_id: userId });
```

---

## 관리자 검수 연계

```
logs INSERT 시:
  검수_YN   = 'N'        → 관리자 검수 큐 대기
  검수_상태 = 'PENDING'

관리자 승인 후:
  검수_YN   = 'Y'
  검수_상태 = 'APPROVED'

큐레이션 풀 노출 조건:
  SELECT * FROM logs WHERE 검수_YN = 'Y' AND user_id != current_user
```

---

---

### `public.likes`

하루 1회 좋아요. 오늘의 로그 완성(서로 다른 시간대 3개 이상) 시에만 전송 가능.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `from_user_id` | `uuid` | — | NOT NULL, FK → `auth.users.id` ON DELETE CASCADE | 보낸 유저 |
| `to_user_id` | `uuid` | — | NOT NULL, FK → `auth.users.id` ON DELETE CASCADE | 받은 유저 |
| `liked_at` | `timestamptz` | — | NOT NULL | 좋아요 전송 시각 (클라이언트 `new Date().toISOString()`) |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**RLS 정책**

| 정책 | 대상 | 조건 |
|------|------|------|
| `users can insert own likes` | INSERT | `from_user_id = auth.uid()` |
| `users can read own likes` | SELECT | `from_user_id = auth.uid()` |

**좋아요 규칙**
- 하루 1회만 전송 가능
- 오늘의 로그 완성(서로 다른 시간대 3개 이상)자만 전송 가능
- 미완성자: 좋아요 버튼 비노출(숨김 처리)

---

## TypeScript 타입

`packages/api/src/database.types.ts`에 추가됨.

```ts
import type { Database } from '@dei/api';

type LogInsert = Database['public']['Tables']['logs']['Insert'];
type DailyLogRow = Database['public']['Tables']['daily_logs']['Row'];
```

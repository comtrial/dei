# dei 매칭 알고리즘 — 정밀 명세서 (구현 기준)

> 이 문서는 **구현자가 그대로 코딩할 수 있는 정밀 명세**다. 설계 배경·결정 근거는
> `docs/superpowers/specs/2026-06-02-matching-algorithm-design.md` 참조.
> 이 문서는 "정확히 어떻게" — 데이터 모델, 상태기계, 모든 분기, SQL/RPC 의사코드,
> Tier 임계값, 동시성 규칙, 실패 처리, 검증 기준.
>
> SSOT 스키마: `supabase/migrations/20260529000010_rooms_v2_baseline.sql`.
> 정책: `packages/shared/src/policy.ts`(POLICY.matching / team / room).

---

## 0. 용어 (Glossary)

| 용어 | 정의 |
|---|---|
| **entry** | `match_queue` 의 한 행. status='waiting' 인 것이 매칭 대상. |
| **team** | 묶음. `kind='user'`(실제 친구팀/혼자) 또는 `kind='synthetic'`(혼자들을 매칭 순간 합성). |
| **solo** | size 1 team (혼자 참여). `team.target_size=1`. |
| **party** | size ≥2 친구팀. `target_size 2..5`. |
| **side** | group_match 의 team_a / team_b. **항상 한 side = 정확히 한 team_id**. |
| **cell cap** | 방 셀 상한. 한쪽 ≤ 5, 양측 합 ≤ 8 (5:3 비대칭 상한). |
| **synthetic team** | 매칭 성사 순간 동성 solo 여럿을 묶어 만든 임시 team. group_match 의 "2팀" 불변식 유지용. |
| **effective_priority** | 정렬 키. 대기 길수록 앞. = `enqueued_at` 에서 boost 차감. |

---

## 1. 상수 / 설정 (POLICY 매핑)

```
GENDER_HARD          = true            # POLICY.matching.requireOppositeGender — 유일한 hard 강제
QUEUE_EXPIRY_HOURS   = 24              # POLICY.matching.queueExpiryHours
REMATCH_COOLDOWN_H   = 24              # POLICY.matching.rematchCooldownHours (여성 면제)
TEAM_MAX             = 5               # POLICY.team.maxMembers (CHECK 1..5 확장 후)
TEAM_MIN             = 1               # POLICY.team.minMembers
SIDE_MAX             = 5               # 한 side 최대 인원
ROOM_CELL_CAP        = 8               # 양측 합 최대 (5+3)
ROOM_EXPIRE_DAYS     = 7               # POLICY.room.autoExpireDays

# Tier 완화 임계 (대기시간 기준, 분) — 운영 데이터로 튜닝 (초기 가안)
T1_MIN               = 30              # Tier0→Tier1 (정확일치→비대칭)
T2_MIN               = 120             # Tier1→Tier2 (비대칭→혼합+region완화)
SWEEP_INTERVAL_SEC   = 45              # pg_cron sweep 주기 (30~60 사이)
PRIORITY_BOOST_PER_TIER = '15 minutes' # effective_priority boost 단위 (튜닝)
```

---

## 2. 데이터 모델 (변경분 명시)

### 2-1. 마이그레이션 (신규 1파일: `2026XXXXXXXXXX_matching_engine.sql`)

```sql
-- (a) 5인 팀 허용 — POLICY.maxMembers=5 정합. 기존 1..4 데이터 무손실.
alter table public.team drop constraint if exists team_target_size_check;
alter table public.team add constraint team_target_size_check
  check (target_size between 1 and 5);

-- (b) 합성팀 식별 (혼자 동적 merge)
alter table public.team add column if not exists kind text not null default 'user'
  check (kind in ('user','synthetic'));
create index if not exists team_synthetic_idx on public.team(kind) where kind='synthetic';

-- (c) 매칭 엔진 멱등/추적 컬럼
alter table public.match_queue add column if not exists required_gender text
  check (required_gender in ('male','female'));   -- 반대 성별 (enqueue 시 계산)
alter table public.match_queue add column if not exists last_tried_at timestamptz;  -- sweep 재시도 추적
-- (group_match_pair_uniq, team_a_id<team_b_id CHECK 는 baseline 에 이미 존재 — 재사용)
```

**DDL 체크리스트:** target_size CHECK 교체 = 무손실. kind — NOT_NULL=Y(default) / INDEX=Y(부분) / CHECK=Y. required_gender — NULL 허용(기존행) / CHECK. last_tried_at — NULL. **PK 불변(team.id / match_queue.id). PK 설정 확인: Y.** 적용 후 `pnpm db:gen-types`.

### 2-2. 상태 (entry / team / group_match)

```
match_queue.status:  waiting ──match──> matched
                          │──expire(24h)──> expired
                          │──user cancel──> cancelled
team.status:         forming → ready → matching → locked(매칭성사) → disbanded
team.kind:           user | synthetic   (synthetic 은 방 종료 시 정리)
group_match.status:  active → ended | cancelled
```

---

## 3. enqueue 경로 (큐 적재 + 즉시 매칭 트리거)

Edge `enqueue-match-queue/index.ts` (기존 + 매칭 트리거 추가):

```
POST enqueue-match-queue { team_id, region? }
1. getAuthenticatedUser(req) → { supabaseAsUser, user }
2. 게이트 (기존): owner profile is_adult/gender/nickname/photo/onboarding_completed_at 확인. 미충족 → 422.
3. 재매칭 제한: getRematchRestriction(last_room_leave_at) — 24h 내 재매칭이면 차단.
   단 여성(profile.gender='female')은 면제(POLICY rematchCooldown 여성 면제).
4. 이미 active room 인 멤버 포함 시 차단 (is_in_active_room).
5. team.gender 로 required_gender = opposite(team.gender) 계산.
6. INSERT match_queue(team_id, gender=team.gender, required_gender, desired_size=team.target_size,
     region, status='waiting', enqueued_at=now(), expires_at=now()+24h) RETURNING id → p_queue_id.
7. **즉시 매칭 시도**: SELECT public.try_match(p_queue_id);   -- §4
8. 응답: try_match 가 group_match_id 반환 → { matched:true, roomId, matchId }
         null 반환 → { matched:false, status:'queued' }   -- 클라는 realtime 구독으로 이후 수신
```

> Phase 0(현 MVP, automation='manual_admin_curation'): 7번을 flag 로 끈다. 운영진이 admin_force_match 로 수동 호출. Phase 1 에서 flag on.

---

## 4. `try_match(p_queue_id)` — 즉시 매칭 RPC (핵심)

```
function try_match(p_queue_id uuid) returns uuid   -- group_match.id 또는 null
  security definer, set search_path=public

1. -- 직렬화: 같은 큐에 대한 동시 매칭 방지 (advisory lock by gender-pair bucket)
   perform pg_advisory_xact_lock( hashtext('match:'|| least(gender,required_gender) ||':'|| greatest(...)) );

2. -- 내 엔트리 잠금
   me := SELECT * FROM match_queue WHERE id=p_queue_id AND status='waiting' FOR UPDATE;
   IF me IS NULL THEN RETURN null;  -- 이미 매칭/취소됨

3. -- 후보 풀 조회: 반대 성별 waiting, effective_priority 정렬
   cand_pool := SELECT q.*, t.kind, t.target_size,
                  (q.enqueued_at - boost(now()-q.enqueued_at)) AS eff_prio
                FROM match_queue q JOIN team t ON t.id=q.team_id
                WHERE q.status='waiting'
                  AND q.gender = me.required_gender          -- 반대 성별 (hard)
                  AND q.team_id <> me.team_id
                  AND (q.expires_at IS NULL OR q.expires_at > now())
                  AND tier_allows(me, q, now())              -- §5 Tier 게이트
                  AND region_ok(me, q, now())                -- §6 region (soft, 시간경과 완화)
                ORDER BY eff_prio ASC
                FOR UPDATE SKIP LOCKED;                      -- 다른 워커가 잡은 후보 skip

4. -- fill: my-side / other-side 를 cell cap 안에서 구성 (§5 fill_strategy)
   plan := build_match_plan(me, cand_pool);   -- 반환: { mySideEntries[], otherSideEntries[], ok }
   IF NOT plan.ok THEN RETURN null;           -- 이번엔 못 만듦 → waiting 잔류 (sweep 가 흡수)

5. -- 가용성 재검증 (스냅샷 불신): 양측 전원 NOT is_in_active_room
   IF EXISTS(SELECT 1 FROM team_member tm JOIN profile p ON p.user_id=tm.user_id
             WHERE tm.team_id IN (plan all team_ids) AND p.is_in_active_room) THEN
     -- 해당 엔트리 cancel/skip 후 RETURN null (다음 시도/sweep 에 위임)
     RETURN null;

6. RETURN match_and_create(plan);   -- §7 원자 생성
```

### boost(waited interval) — effective_priority 가산
```
boost(waited) := PRIORITY_BOOST_PER_TIER * floor( waited / PRIORITY_BOOST_PER_TIER )
-- 15분마다 우선순위가 한 단계씩 당겨짐 → 오래 기다린 엔트리가 후보 스캔 앞단에. 기아 방지.
```

---

## 5. `build_match_plan(me, cand_pool)` + Tier 완화

목표: me(와 같은 side로 합칠 동성 solo들) ↔ other-side 를 **cell cap(한쪽≤5, 합≤8)** 안에서 구성하되, **정확일치 우선, 안 되면 점진 완화**. 첫 성립 조합을 탐욕적으로 확정.

### Tier 게이트 `tier_allows(me, cand, now)` — 둘 중 더 오래 기다린 쪽 대기시간 기준
```
waited := now() - LEAST(me.enqueued_at, cand.enqueued_at)
tier := 0 if waited < T1 ; 1 if waited < T2 ; else 2

Tier 0 (정확일치만): me.desired_size == cand.desired_size
                     (solo↔solo=1:1, party2↔party2, ...)
Tier 1 (비대칭 허용): me.desired_size + cand.desired_size <= ROOM_CELL_CAP
                     AND each side <= SIDE_MAX
                     (남3↔여2=5 OK / 친구팀 size 달라도 합≤8)
Tier 2 (혼합 충원):  Tier1 조건 + solo merge 로 부족분 충원 허용 (아래 fill)
```

### fill 규칙 (한 side를 여러 엔트리로 — 혼자 동적 묶음)
```
build_match_plan(me, cand_pool):
  # A. Tier0 — 정확일치 단일팀 우선
  c := first cand in cand_pool where cand.desired_size == me.desired_size
  if c exists: return { mySide:[me], otherSide:[c], ok:true }

  # B. Tier1+ — 비대칭 단일팀
  if tier(me) >= 1:
    c := first cand where me.desired_size + cand.desired_size <= CELL_CAP
                       and cand.desired_size <= SIDE_MAX and me.desired_size <= SIDE_MAX
    if c exists: return { mySide:[me], otherSide:[c], ok:true }

  # C. Tier1+ — solo merge: me 가 solo(=1)이면 동성 solo 들을 모아 상대 size 에 맞춤
  if tier(me) >= 1 and me.desired_size == 1:
    # 상대 후보(party 또는 solo) 하나 골라, 내 쪽을 동성 solo 로 그 size 만큼(또는 cell cap 안에서) 채움
    target := pick best cand (effective_priority 우선)
    need := min(target.desired_size, SIDE_MAX)              # 균형 목표(정확 아니어도 됨)
    mySolos := SELECT up to `need` same-gender solo waiting entries ORDER BY eff_prio  # me 포함
    # 최소 성사 조건: 양측 각 >=1, 합 <= CELL_CAP. 3:3 도 OK, 정확 동수 아니어도 OK(Tier2)
    if len(mySolos) >= 1 and target valid:
       # 상대도 solo pool 이면 동일하게 묶음
       otherSide := (target.kind party) ? [target] : mergeSolos(required_gender, need)
       if balance_ok(mySolos, otherSide):   # 각 side<=5, 합<=8, 양측>=1
          return { mySide: mySolos, otherSide: otherSide, ok:true }

  # D. Tier2 — 완화 최대: 동수 목표 버리고 cell cap 안 아무 양수
  if tier(me) >= 2:
    # 양측 waiting 을 eff_prio 순으로 그리디하게 채워 합<=8, 각<=5, 각>=1 되는 최초 구성
    return greedy_fill(me, cand_pool, CELL_CAP, SIDE_MAX)

  return { ok:false }   # 못 만듦 → waiting 잔류
```

**예시 (당신 결정 그대로):**
- 남2팀 + 여2팀 → Tier0 정확일치 = 4인 방 ✅ (즉시)
- 남3팀 + 여2팀 (size 어긋남, 30분 경과) → Tier1 비대칭 = 5인 방 (3:2) ✅
- 남 혼자 ×3 + 여 혼자 ×3 → solo merge 양측 = 3:3 = 6인 방 ✅ (4:4 고집 안 함)
- 남 혼자 ×3 + 여4팀 → solo merge 3명 ↔ 4팀 = 3:4 = 7인 방 (Tier1+) ✅
- 한쪽이 5명 초과 구성? → **금지** (SIDE_MAX=5, CELL_CAP=8)

---

## 6. region 처리 (soft, 시간경과 완화)

```
region_ok(me, cand, now):
  waited := now() - LEAST(me.enqueued_at, cand.enqueued_at)
  if waited < T2_MIN: return me.region IS NULL OR cand.region IS NULL OR me.region = cand.region  # 같은 지역 선호
  else: return true   # T2 경과 → region 무시 (전국 매칭, 기아 방지)
```
정렬에서도 같은 region 을 우선(ORDER BY (region 일치 desc), eff_prio).

---

## 7. `match_and_create(plan)` — 원자 생성 RPC

```
function match_and_create(plan) returns uuid   -- group_match.id
  security definer, set search_path=public, 단일 트랜잭션

1. -- (solo side면) 합성팀 생성
   for each side in (mySide, otherSide):
     if side has multiple entries OR entries are solo-merge:
       v_team := INSERT team(owner_user_id = side[0].owner, gender = side.gender,
                  target_size = count(side members), status='matching', kind='synthetic')
                 RETURNING id
       INSERT team_member SELECT v_team, member_user_id, 'member' FROM (side members)
       side.effective_team_id := v_team
     else:
       side.effective_team_id := side[0].team_id    # 기존 친구팀 그대로

2. -- canonical 정렬
   (v_a, v_b) := order so that v_a < v_b   # team_a_id < team_b_id CHECK

3. INSERT room(status='active', member_count=0, active_member_count=0,
        expires_at=now()+7 days) RETURNING id → v_room

4. INSERT group_match(team_a_id=v_a, team_b_id=v_b, room_id=v_room, status='active')
        RETURNING id → v_gm        # group_match_pair_uniq 멱등 방어
   -- exception unique_violation → ROLLBACK, return null

5. INSERT match_member SELECT v_gm, tm.user_id,
        (case when tm.team_id=v_a then 'a' else 'b' end)
        FROM team_member tm WHERE tm.team_id IN (v_a, v_b)

6. INSERT room_member SELECT v_room, tm.user_id, 'member', 'active'
        FROM team_member tm WHERE tm.team_id IN (v_a, v_b)

7. UPDATE room SET member_count = (cnt), active_member_count = (cnt) WHERE id=v_room

8. UPDATE match_queue SET status='matched', matched_at=now()
        WHERE id IN (all entry ids in plan) AND status='waiting'     # all-or-nothing
   -- 만약 영향 행수 != 기대 → 누군가 동시에 매칭/취소됨 → RAISE → ROLLBACK

9. UPDATE profile SET is_in_active_room=true WHERE user_id IN (all members)
10. UPDATE team SET status='locked' WHERE id IN (v_a, v_b)   # synthetic 도 locked
11. INSERT room_lifecycle(room_id=v_room, event='created', detail=jsonb{match_id:v_gm, plan})
12. RETURN v_gm

exception when unique_violation then return null   # 동시 같은 쌍 → 멱등 무시
```

**매칭 성사 푸시:** 11번 후 best-effort 로 `room_matched` 푸시(quietHoursExempt 에 포함). A 의 sendPush 인프라 의존(미구현 시 skip).

---

## 8. `match_sweep()` — 안전망 RPC (pg_cron `SWEEP_INTERVAL_SEC`)

```
function match_sweep() returns int   -- 이번 회차 성사 건수
1. for gender_pair in [(male,female)]:
2.   loop:
3.     # waiting 엔트리를 eff_prio 순으로 하나 집어 try_match 시도
4.     e := SELECT id FROM match_queue WHERE status='waiting'
              AND (last_tried_at IS NULL OR last_tried_at < now() - interval '10s')
            ORDER BY eff_prio ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
5.     exit when e IS NULL;
6.     UPDATE match_queue SET last_tried_at=now() WHERE id=e;
7.     if try_match(e) is not null: matched++;
8.   end loop;
9. return matched;
```
- **즉시 경로가 못 잡는 것**(동시 도착·잔여 solo 누적·시간경과 Tier 완화 진입)을 주기적으로 회수.
- `last_tried_at` 으로 busy-loop 방지.

## 8-1. `expire_match_queue()` — 만료 정리 (pg_cron, 기존 expire Edge 로직 이관 가능)
```
UPDATE match_queue SET status='expired'
  WHERE status='waiting' AND expires_at < now();
# expired 엔트리의 team.status 복구(forming) — 재시도 가능하게
```

## 8-2. `admin_force_match(team_a, team_b)` — 운영진 수동 편성 백도어
```
# Phase 0 / 예외 운영용. match_and_create 를 직접 호출(Tier 게이트 우회).
# service_role 또는 is_admin() 게이트.
```

---

## 9. 동시성 / 정합성 규칙 (필수)

| 위험 | 방어 |
|---|---|
| 두 워커가 같은 큐 동시 매칭 | `pg_advisory_xact_lock`(gender-pair bucket) + 내 엔트리 `FOR UPDATE` |
| 같은 후보를 둘이 동시에 | 후보 `FOR UPDATE SKIP LOCKED` |
| 같은 쌍 group_match 2건 | `group_match_pair_uniq(team_a,team_b) where active` + `exception unique_violation` |
| 데드락 | canonical lock 순서(항상 작은 team_id 먼저) |
| 한쪽만 matched | 8번 단일 UPDATE `WHERE id IN (...)` + 영향행수 검증 → 불일치 시 ROLLBACK |
| 합성팀 만들고 한 명 직전 이탈 | 5번 가용성 재검증 + 전체 트랜잭션 롤백 |
| 이미 방 있는 유저 | 5번 `is_in_active_room` 재검증 |
| 고아 room | room/group_match/member 가 단일 트랜잭션 — 롤백 시 전부 |
| solo merge 인데 매칭 실패 | 합성팀 INSERT 도 같은 트랜잭션 → 롤백 시 synthetic team 도 사라짐 |

---

## 10. 검증 (실DB e2e — CLAUDE.md §8·9)

배포 산출물: 마이그레이션 적용 + `match_and_create`/`try_match`/`match_sweep` RPC + pg_cron 등록 + enqueue Edge 배포. 마이그레이션만 ≠ 완료.

실DB e2e 시나리오 (전용 테스트 유저 실 JWT, try/finally cleanup, BASELINE==AFTER):
- **E1 정확일치**: 남2팀 enqueue + 여2팀 enqueue → 4인 방 1개, 양 큐 matched, room_member 4.
- **E2 비대칭**: 남3팀 + 여2팀(30분+ 시뮬레이션) → 5인 방(3:2).
- **E3 solo merge**: 남 혼자×3 + 여 혼자×3 → 3:3 방, synthetic team 2개 생성, room_member 6.
- **E4 비대칭+merge**: 남 혼자×3 + 여4팀 → 3:4 방.
- **E5 상한 초과 거부**: 한 side 6명 구성 시도 → 안 됨(SIDE_MAX=5).
- **E6 동시성**: 두 팀이 같은 상대를 동시 enqueue → 정확히 1 매칭, 다른 하나 waiting/다음.
- **E7 기아 방지**: 남 혼자 7 / 여 혼자 5 → 5쌍 즉시, 잔여 2명 sweep 가 다음 유입과 회수.
- **E8 성별 공급 0**: 남만 enqueue → 매칭 0, 24h 후 expired.
- **E9 already-in-room**: is_in_active_room=true 유저 포함 → 매칭 제외.
- **E10 멱등**: 같은 쌍 동시 생성 시도 → group_match 1건만.

---

## 11. 롤아웃 (Phase)

| Phase | 내용 | automation flag |
|---|---|---|
| 0 | RPC 머지 + 운영진 `admin_force_match` 수동 검증 | manual_admin_curation |
| 1 | enqueue Edge 즉시 자동 매칭 (← 빠른 매칭 달성) | auto_immediate |
| 2 | sweep cron 안전망 + expire cron | auto_immediate + sweep |
| 3 | 후보 정렬 eff_prio → 품질 score (hook 교체) | auto_scored |

---

## 12. 미해결 (운영 튜닝/후속)
- T1/T2/boost 수치 — 실데이터로 튜닝(초기 30m/120m/15m 가안)
- synthetic team owner 지정 규칙(첫 enqueue 자/시스템 계정) + 방 종료 시 정리
- 매칭 성사 푸시 `room_matched` = A sendPush 인프라 의존
- B의 S06 team/new 가 maxMembers=5 / target_size 1..5 반영하는지 확인
- desired_size 와 team.target_size 정합(현재 별도 컬럼 — 드리프트 가능, enqueue 에서 team.target_size 로 강제 권장)

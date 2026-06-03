# 매칭 알고리즘 설계서 — 빠른 매칭 (혼자/친구 조합)

> 상태: 설계 (구현 전). 담당 후보: B(매칭) 또는 A. base 기준: `origin/main`.
> 최우선 목표(사용자 확정): **최대한 빠른 매칭** (성사율·속도 > 품질). 품질은 후속 확장.
> 근거: 조합 경우의 수 전수 분석 + 3안 비교(FIFO/배치/점수) → 하이브리드 추천.
> 권위 SSOT: `packages/shared/src/policy.ts`(POLICY.matching/team/room), `supabase/migrations/20260529000010_rooms_v2_baseline.sql`(team/match_queue/group_match/match_member/room/room_member), `supabase/functions/enqueue-match-queue/index.ts`.

---

## 1. 목표와 불변 결정 (사용자 확정)

매칭 = **반대 성별 두 묶음**을 짝지어 `group_match` + `room` 생성. 큐 입력 2종: **혼자(size1)** / **친구팀(size 2~5)**.

**불변 결정:**
1. **size 정확일치 우선** — 남2↔여2(4인 방) 먼저 시도.
2. **안 되면 여러 사람을 한 side로 합산** — 단 **한 방 성비 5:3 초과 금지**(한쪽 ≤5, 합 ≤8셀).
3. **혼자끼리 동적 묶음 허용** — 4:4 고집 안 함, **3:3이라도 성사 가능하면 즉시**.
4. **hard 강제 = 반대 성별만**(`requireOppositeGender`). size·region은 완화 가능.
5. **빠른 매칭 최우선** — 정확일치 고집보다 빠른 성사.

**team 최대 인원 = 5 확정** (CHECK 1..4 → 1..5 확장). 근거: POLICY `maxMembers:5` + "8셀=우리5+상대3 비대칭" 주석 + 사용자 "5:3 상한". 4:4 대칭이 아니라 5:3 비대칭이 제품 의도.

---

## 2. 매칭 단위 — 하이브리드 (c)솔로 merge 1차 + (b)비대칭 2차

`group_match`는 **정확히 2팀**(team_a + team_b) 구조. 이를 **건드리지 않고** 조합 매칭을 실현:
- **혼자(size1) 엔트리는 매칭 성사 순간 동성끼리 하나의 합성 팀(`kind='synthetic'`)으로 merge** → group_match 행의 team_id는 (i)원래 친구팀 또는 (ii)방금 합성된 솔로팀. **"한 side = 한 team" 불변식 유지**(다중팀-한side 대공사 회피).
- **비대칭 허용**: 두 팀 size가 달라도 합 ≤8셀이면 성사(남3↔여2 = 5셀 방 OK).

> 폐기: (d)"한 side에 여러 독립 팀 합산"은 group_match가 단일 team_id 컬럼이라 스키마 대공사(RLS 전면 재작성) → 솔로 merge로 동일 효과를 무변경 달성하므로 불채택.

---

## 3. 알고리즘 — "FIFO 즉시 + sweep 안전망" + Tier 완화

### 3-1. 큐 분할 + 정렬
- 큐는 성별로 2분할(male-side ↔ female-side). `requireOppositeGender`가 유일 hard.
- 정렬 = `effective_priority` = `enqueued_at` - (대기시간이 Tier 임계 넘을 때마다 가산되는 boost). **오래 기다린 엔트리를 앞으로 당김 → 기아 방지 1차 장치.**

### 3-2. 즉시 경로 — `try_match(p_team)` (enqueue 시 트리거)
1. enqueue Edge가 프로필 게이트 + 재매칭 제한 통과 후 `match_queue` waiting INSERT(`required_gender` = 반대 성별 자동 계산).
2. 즉시 `try_match` 호출(advisory lock으로 직렬화):
   - 상대 성별 큐를 `effective_priority` 순 스캔.
   - **fill_strategy(§3-4)**로 상대 side를 친구팀 1개 또는 혼자 여러 명(합성팀 후보)으로 채워 "합 셀 ≤8 & 한쪽 ≤5"를 만족하는 **첫 조합을 탐욕적 확정**(정확일치 고집 안 함).
   - 성립 시 `match_and_create`(§4)로 (필요 시 합성팀 생성 →) group_match+room+멤버 **원자 생성**.
3. 못 찾으면 waiting 잔류 → 다음 enqueue 또는 sweep가 흡수.

### 3-3. sweep 안전망 — pg_cron 30~60초
즉시 경로는 "내가 들어올 때 상대가 이미 있어야" 성사 → **동시 도착·잔여·혼자 누적**은 못 잡음. sweep가:
- 양쪽 큐를 region 그룹 → `effective_priority` 정렬로 한 번에 보고, 비대칭/솔로 merge로 최대한 페어링.
- 잔여 혼자를 다음 라운드로 이월(캐리오버).

### 3-4. fill_strategy — Tier 완화 (불변 결정 #1·#2 구현)
```
Tier 0 (대기 0~T1, 즉시):  정확일치 — 친구팀 size 동일(2↔2,3↔3,4↔4) / 혼자1↔혼자1
Tier 1 (대기 ≥ T1≈30m):   비대칭 — 남3↔여2(합5) 그대로 / 친구팀 size에 맞춰 동성 혼자 묶어 합성팀
Tier 2 (대기 ≥ T2≈2h):    혼합+region완화 — 합셀 상한 안 아무 양수 충원, 잔여 혼자로 격차 흡수, region soft
```
한쪽 상한 = 5, 합 상한 = 8. 분배 자유(비대칭). 솔로 합성팀이 size5 되려면 CHECK 1..5 선행(§5).

### 3-5. 빠른 매칭 보장 + 기아 0
- `effective_priority` boost로 대기시간 상한 내 Tier 완화 → 어떤 엔트리도 Tier 2에서는 "반대 성별이 1명이라도 있으면" 성사.
- 굶는 유일 케이스 = **반대 성별 공급 0**(알고리즘으로 못 푸는 1차 제약 — 여성 유입 인센티브는 이미 `femaleInstantRematchFree` 존재).

---

## 4. `match_and_create` RPC (SECURITY DEFINER, 원자적)

`send_room_message` 패턴(security definer / set search_path=public / revoke public,anon / grant authenticated).

입력: 매칭 확정된 양측 엔트리(친구팀 team_id 또는 솔로 user_id 목록 + side). 처리(단일 트랜잭션):
1. (솔로 side면) 합성 team INSERT(`kind='synthetic'`, owner=시스템/대표, target_size=인원) + team_member INSERT.
2. 양측 가용성 재검증(스냅샷 불신): 전원 `NOT is_in_active_room`. 위반 시 롤백/후보 skip.
3. canonical 정렬(team_a_id < team_b_id) → `room` INSERT(status='active', expires_at=now()+7d).
4. `group_match` INSERT(team_a/b, room, 'active') — `group_match_pair_uniq` 멱등 방어.
5. `match_member`(side a/b) + `room_member`(status='active') INSERT (team_member SELECT).
6. `match_queue` 양측 `status='matched'` (단일 UPDATE `WHERE id IN (...)` — all-or-nothing).
7. `profile.is_in_active_room=true`(전원) + `team.status='locked'` + `room_lifecycle('created')`.
8. `exception when unique_violation then 롤백/null` (동시 같은 쌍 멱등 흡수).

동시성: 내 큐 행 `FOR UPDATE` + 후보 `FOR UPDATE SKIP LOCKED` + `group_match_pair_uniq` 최후방어 + canonical lock 순서(데드락 방지).

---

## 5. 스키마 변경 (마이그레이션 1개, 최소)

```sql
-- 1) BLOCKER 해소: 5인 팀 허용 (POLICY.maxMembers=5 정합)
alter table public.team drop constraint team_target_size_check;
alter table public.team add constraint team_target_size_check check (target_size between 1 and 5);

-- 2) 합성팀 식별 + 라이프사이클
alter table public.team add column if not exists kind text not null default 'user'
  check (kind in ('user','synthetic'));
-- (synthetic 팀은 방 종료 시 정리 대상 — room_lifecycle/leave 로직과 연동)

-- 3) match_and_create RPC (security definer) — §4
-- 4) match_sweep() RPC + pg_cron 등록 (30~60초)
-- 5) (선택) match_queue.desired_size 와 team.target_size 정합 트리거/제약
```

**DDL 체크리스트:** team.kind — PK=N / NOT_NULL=Y(default 'user') / INDEX=N(필요시 synthetic 부분인덱스) / FK=N / DEFAULT=Y / TYPE=text+check / NAMING=Y. target_size CHECK 교체 = 기존 데이터 1..4라 1..5 확장은 무손실. **PK 설정 확인: Y(team.id 불변).** 적용 후 `pnpm db:gen-types`.

> RLS: group_match/room/match_member INSERT 정책 부재 → SECURITY DEFINER RPC만 쓰기 가능(A 거버넌스 정합). INSERT 정책 추가 금지.

---

## 6. enqueue Edge 연동

기존 `enqueue-match-queue/index.ts`(프로필 게이트 + 재매칭 제한) 끝에:
- `match_queue` waiting INSERT 후 즉시 `try_match`(또는 `match_and_create` 직접) 호출.
- `supabaseAsUser`(user JWT)로 호출 → auth.uid() 소유 가드. service_role 호출 시 auth.uid()=NULL 함정 회피.
- 응답: 매칭됐으면 roomId 동봉, 아니면 'queued' → 클라는 group_match/room realtime 구독으로 이후 수신.

---

## 7. 정합성 방어 (조합 매칭 특유)
- 합성팀 생성 직후 한 명 이탈 → 트랜잭션 롤백
- "한 side=한 team" 불변식 유지(merge로 다중팀 우회)
- 이미 active room 유저 제외 재검증 / 한쪽만 matched 불가(단일 UPDATE) / 고아 room 롤백
- region hard 금지(soft만) — 좁은 지역 한 성별 편중 기아 방지

---

## 8. 롤아웃 + 검증
- **Phase 0**: `match_and_create` 머지 → 운영진 수동 호출 검증(현 `automation='manual_admin_curation'` 유지, flag).
- **Phase 1**: enqueue Edge 즉시 자동 매칭 (← 빠른 매칭 목표 달성). region 1차 무시.
- **Phase 2**: sweep cron 안전망.
- **Phase 3**: (수급 충분 시) 후보 정렬 `enqueued_at`→score(품질). hook 분리 유지.

**검증(CLAUDE.md §8·9):** 마이그레이션 적용 + pg_cron 등록 + enqueue Edge 배포 + **실DB e2e**(전용 테스트 유저 실 JWT → enqueue → 매칭 성사 → group_match/room/room_member 생성 확인, 동시성: 두 팀 동시 enqueue → 1 매칭만, 솔로 3+3 merge, 비대칭 3:2, 기아 시나리오 sweep 회수). 마이그레이션만 ≠ 완료.

---

## 9. 미해결/후속
- T1/T2 Tier 임계값 구체 수치(30m/2h 가안) — 운영 데이터로 튜닝
- 합성팀 owner/이탈/재매칭 정책 세부
- region soft 완화 반경 단계
- 5인 팀 UI(친구 초대 max 5) — B의 S06 team/new가 maxMembers=5 반영하는지 확인 필요
- 매칭 성사 푸시(`room_matched` — quietHoursExempt에 이미 있음) 발송 = A의 sendPush 인프라 의존

# 매칭 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 혼자/친구 참여가 섞인 큐에서 반대 성별 묶음을 **최대한 빠르게** 매칭(group_match + room 생성)하는 엔진을, **앱 배포 의존 없이 Supabase 측(마이그레이션 RPC + pg_cron + Edge)에 완전히** 구현한다.

**Architecture:** 모든 매칭 로직은 **Postgres SECURITY DEFINER RPC**(try_match / build_match_plan 내장 / match_and_create / match_sweep / expire)에 있고, **pg_cron**이 sweep·expire를 주기 실행, 기존 **Edge `enqueue-match-queue`**가 큐 적재 직후 `try_match`를 호출한다. 앱은 `enqueue-match-queue` 호출 + group_match/room realtime 구독만 — **매칭 규칙·임계값을 바꿔도 앱 재빌드 불필요**(전부 DB/Edge 서버 측). Tier 완화(정확일치→비대칭→solo merge)로 기아 0.

**Tech Stack:** Supabase Postgres (PL/pgSQL RPC, pg_cron, advisory lock, FOR UPDATE SKIP LOCKED) / Supabase Edge Functions (Deno) / Vitest 통합 테스트(실 Supabase) / `@dei/shared` POLICY.

> 명세 SSOT: `docs/matching-spec/ALGORITHM-SPEC.md` (§번호 참조). 설계: `docs/superpowers/specs/2026-06-02-matching-algorithm-design.md`.
> 확정 결정: size 정확일치 우선→안되면 합산(5:3 상한) / 혼자 동적 merge / 3:3도 즉시 / team 최대 5 / 빠른 매칭 최우선 / **앱 배포 의존 0**.

---

## 앱 배포 비의존 원칙 (이 플랜의 핵심 제약)

- 매칭 **알고리즘·임계값·Tier·상한**은 전부 **RPC(마이그레이션) + Edge**에 있다. 변경 = `supabase db push` + `functions deploy`로 끝, **앱 재빌드/스토어 심사 불필요**.
- 앱이 하는 일은 둘뿐: ① `supabase.functions.invoke('enqueue-match-queue')` ② `group_match`/`room`/`room_member` realtime 구독(매칭 수신). 둘 다 이미 인프라 존재.
- 자동 매칭 on/off·즉시여부는 **DB 설정 테이블(`match_config`)** 플래그로 — 앱 코드 무관, 운영이 SQL/대시보드로 토글.

---

## 파일 구조 (생성/수정 맵)

**마이그레이션 (전부 신규, 순서대로):**
- Create `supabase/migrations/<ts>_matching_schema.sql` — team CHECK 1..5, team.kind, match_queue.required_gender/last_tried_at, match_config 테이블
- Create `supabase/migrations/<ts>_matching_rpc.sql` — `_match_boost`, `_tier_of`, `match_and_create`, `try_match`, `match_sweep`, `expire_match_queue`, `admin_force_match`
- Create `supabase/migrations/<ts>_matching_cron.sql` — pg_cron 확장 + sweep/expire 스케줄

**Edge (수정):**
- Modify `supabase/functions/enqueue-match-queue/index.ts` — 큐 적재 직후 `try_match` 호출 (config 플래그 게이트)

**테스트 (통합, 실 Supabase):**
- Create `apps/mobile/__tests__/integration/matching-rpc.test.ts` — E1~E10 시나리오 (setup.ts 헬퍼 재사용)

**배포 스크립트 (실DB e2e):**
- Create `scripts/e2e-matching-realdb.mjs` — 앱 동일 경로(functions.invoke) 관통

> 앱 화면/컴포넌트 변경 **없음** (배포 비의존). database.types.ts 는 gen-types 산출.

---

## Task 1: 매칭 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/20260602000010_matching_schema.sql`

**DDL 체크리스트:** team.target_size CHECK 1..4→1..5(무손실) / team.kind NOT_NULL default'user' CHECK / match_queue.required_gender NULL+CHECK / match_queue.last_tried_at NULL / match_config PK=key. FK 변경 없음. **PK 설정 확인: Y (team.id / match_queue.id 불변, match_config.key 신규 PK).**

- [ ] **Step 1: Write the migration**

```sql
-- 20260602000010_matching_schema.sql
-- 매칭 엔진 스키마. 앱 배포 비의존 — 매칭 설정은 match_config 로 런타임 토글.
-- 명세: docs/matching-spec/ALGORITHM-SPEC.md §2.

-- (a) 5인 팀 허용 (POLICY.team.maxMembers=5 정합, 8셀=5+3). 기존 1..4 무손실.
alter table public.team drop constraint if exists team_target_size_check;
alter table public.team add constraint team_target_size_check
  check (target_size between 1 and 5);

-- (b) 합성팀 식별 (혼자 동적 merge)
alter table public.team add column if not exists kind text not null default 'user'
  check (kind in ('user','synthetic'));
create index if not exists team_synthetic_idx on public.team(kind) where kind = 'synthetic';

-- (c) 매칭 엔진 큐 컬럼
alter table public.match_queue add column if not exists required_gender text
  check (required_gender in ('male','female'));
alter table public.match_queue add column if not exists last_tried_at timestamptz;

-- (d) 런타임 설정 테이블 (앱 재빌드 없이 매칭 동작 토글)
create table if not exists public.match_config (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.match_config(key, value) values
  ('automation', '"manual_admin_curation"'::jsonb),     -- manual_admin_curation | auto_immediate | auto_scored
  ('tier1_minutes', '30'::jsonb),
  ('tier2_minutes', '120'::jsonb),
  ('boost_minutes', '15'::jsonb),
  ('side_max', '5'::jsonb),
  ('cell_cap', '8'::jsonb)
on conflict (key) do nothing;
alter table public.match_config enable row level security;
-- 읽기는 authenticated(클라가 자동매칭 여부 알 필요 시), 쓰기는 service_role/admin 만.
create policy match_config_select on public.match_config for select to authenticated using (true);

-- 헬퍼: config 값 읽기
create or replace function public.match_cfg_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.match_config where key = p_key), p_default);
$$;
create or replace function public.match_cfg_text(p_key text, p_default text)
returns text language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}') from public.match_config where key = p_key), p_default);
$$;
```

- [ ] **Step 2: Apply locally + verify**

Run: `pnpm db:reset`
Expected: 적용 무에러. `\d public.team` 에 `kind` + CHECK 1..5; `\d public.match_config` PK=key; `match_config` 6행.

- [ ] **Step 3: Regenerate types**

Run: `pnpm db:gen-types`
Expected: `packages/api/src/database.types.ts` 에 `match_config` + `team.kind` + `match_queue.required_gender/last_tried_at` 추가.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602000010_matching_schema.sql packages/api/src/database.types.ts
git commit -m "feat(db): 매칭 엔진 스키마 — team 1..5/kind, match_queue required_gender, match_config"
```

---

## Task 2: 매칭 헬퍼 함수 (boost / tier)

**Files:**
- Create: `supabase/migrations/20260602000020_matching_helpers.sql`
- Test: `apps/mobile/__tests__/integration/matching-rpc.test.ts` (이 task 에서 신설 — 헬퍼부터)

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/__tests__/integration/matching-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

let run = false;
let admin: SupabaseClient;

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (run) admin = makeServiceClient();
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)('matching helpers', () => {
  it('_tier_of returns 0 for fresh, 1 after tier1_minutes, 2 after tier2_minutes', async () => {
    const { data: t0 } = await admin.rpc('_tier_of', { p_waited_minutes: 0 });
    const { data: t1 } = await admin.rpc('_tier_of', { p_waited_minutes: 45 });
    const { data: t2 } = await admin.rpc('_tier_of', { p_waited_minutes: 200 });
    expect(t0).toBe(0);
    expect(t1).toBe(1);
    expect(t2).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm db:start && RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: FAIL — function `_tier_of` does not exist.

- [ ] **Step 3: Write helpers**

```sql
-- 20260602000020_matching_helpers.sql
-- effective_priority boost + tier 판정. 명세 §4·§5.

-- 대기시간(분)으로 tier 판정 (config 기반)
create or replace function public._tier_of(p_waited_minutes int)
returns int language sql stable set search_path = public as $$
  select case
    when p_waited_minutes < public.match_cfg_int('tier1_minutes', 30) then 0
    when p_waited_minutes < public.match_cfg_int('tier2_minutes', 120) then 1
    else 2
  end;
$$;

-- effective_priority: 오래 기다릴수록 과거로 당겨 정렬 앞단에. boost_minutes 마다 한 단계.
create or replace function public._match_boost(p_enqueued_at timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select p_enqueued_at - (
    (floor(extract(epoch from (now() - p_enqueued_at)) / 60
       / public.match_cfg_int('boost_minutes', 15)))
    * (public.match_cfg_int('boost_minutes', 15) || ' minutes')::interval
  );
$$;
```

- [ ] **Step 4: Run to verify pass**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: PASS (tier helper). (boost 는 Task6 시나리오에서 간접 검증.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260602000020_matching_helpers.sql apps/mobile/__tests__/integration/matching-rpc.test.ts
git commit -m "feat(db): 매칭 헬퍼 _tier_of/_match_boost (config 기반)"
```

---

## Task 3: `match_and_create` RPC (원자 생성 + 합성팀)

**Files:**
- Create: `supabase/migrations/20260602000030_match_and_create.sql`
- Modify (append): `apps/mobile/__tests__/integration/matching-rpc.test.ts`

> 명세 §7. 입력 = 양측 멤버 user_id 배열 + 각 side gender. solo 여럿이면 synthetic team 생성. **service_role 로 호출 가능**(admin_force_match·sweep 가 사용). canonical (team_a<team_b).

- [ ] **Step 1: Write the failing test (append)**

```ts
  it('match_and_create: 2 solos vs 2 solos → synthetic teams + room + 4 room_members', async () => {
    // 테스트 유저 4명 + 프로필
    const ids: string[] = [];
    async function mkUser(email: string, gender: 'male'|'female') {
      const { data } = await admin.auth.admin.createUser({ email, password: 'pw-1234', email_confirm: true });
      ids.push(data!.user!.id);
      await admin.from('profile').update({ gender, nickname: email, photo_url: 'x', is_adult: true,
        onboarding_completed_at: new Date().toISOString() }).eq('user_id', data!.user!.id);
      return data!.user!.id;
    }
    const m1 = await mkUser('e2e-m1@example.test', 'male');
    const m2 = await mkUser('e2e-m2@example.test', 'male');
    const f1 = await mkUser('e2e-f1@example.test', 'female');
    const f2 = await mkUser('e2e-f2@example.test', 'female');

    const { data: gmId, error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: [m1, m2], p_side_a_gender: 'male',
      p_side_b_user_ids: [f1, f2], p_side_b_gender: 'female',
    });
    expect(error).toBeNull();
    expect(gmId).toBeTruthy();

    const { data: gm } = await admin.from('group_match').select('room_id, status').eq('id', gmId).single();
    expect(gm!.status).toBe('active');
    const { count } = await admin.from('room_member').select('*', { count: 'exact', head: true }).eq('room_id', gm!.room_id);
    expect(count).toBe(4);
    const { count: synthCount } = await admin.from('team').select('*', { count: 'exact', head: true }).eq('kind', 'synthetic');
    expect(synthCount).toBeGreaterThanOrEqual(2);

    // cleanup
    await admin.from('room').delete().eq('id', gm!.room_id);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });
```

- [ ] **Step 2: Run to verify fail**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: FAIL — function `match_and_create` does not exist.

- [ ] **Step 3: Write the RPC**

```sql
-- 20260602000030_match_and_create.sql
-- 명세 §7. 양측 멤버를 받아 (필요시 synthetic team 생성 →) group_match+room+멤버 원자 생성.
create or replace function public.match_and_create(
  p_side_a_user_ids uuid[], p_side_a_gender text,
  p_side_b_user_ids uuid[], p_side_b_gender text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_a uuid; v_team_b uuid; v_tmp uuid; v_room uuid; v_gm uuid; v_cnt int;
begin
  if array_length(p_side_a_user_ids,1) is null or array_length(p_side_b_user_ids,1) is null then
    raise exception 'empty_side';
  end if;
  if p_side_a_gender = p_side_b_gender then raise exception 'same_gender'; end if;
  -- 상한 검증(명세 §5): 각 side <= side_max
  if array_length(p_side_a_user_ids,1) > public.match_cfg_int('side_max',5)
     or array_length(p_side_b_user_ids,1) > public.match_cfg_int('side_max',5)
     or (array_length(p_side_a_user_ids,1)+array_length(p_side_b_user_ids,1)) > public.match_cfg_int('cell_cap',8) then
    raise exception 'over_capacity';
  end if;
  -- 가용성 재검증: 양측 전원 NOT is_in_active_room
  if exists (select 1 from public.profile p
             where p.user_id = any(p_side_a_user_ids || p_side_b_user_ids) and p.is_in_active_room) then
    raise exception 'member_busy';
  end if;

  -- side A 팀 구성: 1명이고 기존 user 팀이면 그 팀, 아니면 synthetic
  v_team_a := public._ensure_side_team(p_side_a_user_ids, p_side_a_gender);
  v_team_b := public._ensure_side_team(p_side_b_user_ids, p_side_b_gender);

  -- canonical (team_a_id < team_b_id)
  if v_team_a > v_team_b then v_tmp := v_team_a; v_team_a := v_team_b; v_team_b := v_tmp; end if;

  insert into public.room(status, member_count, active_member_count, expires_at)
    values('active', 0, 0, now() + interval '7 days') returning id into v_room;
  insert into public.group_match(team_a_id, team_b_id, room_id, status)
    values(v_team_a, v_team_b, v_room, 'active') returning id into v_gm;
  insert into public.match_member(match_id, user_id, side)
    select v_gm, tm.user_id, case when tm.team_id = v_team_a then 'a' else 'b' end
    from public.team_member tm where tm.team_id in (v_team_a, v_team_b);
  insert into public.room_member(room_id, user_id, role, status)
    select v_room, tm.user_id, 'member', 'active'
    from public.team_member tm where tm.team_id in (v_team_a, v_team_b);
  select count(*) into v_cnt from public.room_member where room_id = v_room and status='active';
  update public.room set member_count = v_cnt, active_member_count = v_cnt where id = v_room;
  update public.profile set is_in_active_room = true
    where user_id = any(p_side_a_user_ids || p_side_b_user_ids);
  update public.team set status='locked' where id in (v_team_a, v_team_b);
  insert into public.room_lifecycle(room_id, event, detail)
    values(v_room, 'created', jsonb_build_object('match_id', v_gm));
  return v_gm;
exception
  when unique_violation then return null;  -- 동시 같은 쌍 멱등
end $$;

-- side 멤버 → team_id. 1명+기존user팀 재사용, 아니면 synthetic 생성.
create or replace function public._ensure_side_team(p_user_ids uuid[], p_gender text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_owner uuid := p_user_ids[1];
begin
  -- 단일 멤버이고 그 유저가 소유한 forming/ready user-team 이 있으면 재사용
  if array_length(p_user_ids,1) = 1 then
    select t.id into v_team from public.team t
      where t.owner_user_id = v_owner and t.kind='user'
        and t.status in ('forming','ready','matching') and t.gender = p_gender
      order by t.created_at desc limit 1;
    if v_team is not null then return v_team; end if;
  end if;
  -- 그 외 synthetic 팀 생성 (solo merge 또는 팀 표현)
  insert into public.team(owner_user_id, gender, target_size, status, kind)
    values(v_owner, p_gender, array_length(p_user_ids,1), 'matching', 'synthetic')
    returning id into v_team;
  insert into public.team_member(team_id, user_id, role)
    select v_team, uid, case when uid = v_owner then 'owner' else 'member' end
    from unnest(p_user_ids) uid
    on conflict (team_id, user_id) do nothing;
  return v_team;
end $$;

revoke all on function public.match_and_create(uuid[],text,uuid[],text) from public, anon;
grant execute on function public.match_and_create(uuid[],text,uuid[],text) to authenticated;
revoke all on function public._ensure_side_team(uuid[],text) from public, anon;
```

- [ ] **Step 4: Run to verify pass**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: PASS (E3 핵심 — synthetic team + 4 room_member).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260602000030_match_and_create.sql apps/mobile/__tests__/integration/matching-rpc.test.ts
git commit -m "feat(db): match_and_create RPC — synthetic team merge + 원자 group_match/room 생성"
```

---

## Task 4: `try_match` RPC (Tier 완화 페어링)

**Files:**
- Create: `supabase/migrations/20260602000040_try_match.sql`
- Modify (append): `apps/mobile/__tests__/integration/matching-rpc.test.ts`

> 명세 §4·§5·§6. advisory lock + FOR UPDATE SKIP LOCKED. solo merge + 비대칭 fill. 빠른 매칭: Tier0 정확일치 우선, 안 되면 완화.

- [ ] **Step 1: Write the failing test (append)**

```ts
  it('try_match: 남2팀 큐 + 여2팀 큐 → 즉시 4인 방(Tier0 정확일치)', async () => {
    const ids: string[] = []; const teams: string[] = []; const queues: string[] = [];
    async function mkTeamQueue(prefix: string, gender: 'male'|'female', size: number) {
      const members: string[] = [];
      for (let i = 0; i < size; i++) {
        const { data } = await admin.auth.admin.createUser({ email: `e2e-${prefix}${i}@example.test`, password: 'pw-1234', email_confirm: true });
        ids.push(data!.user!.id); members.push(data!.user!.id);
        await admin.from('profile').update({ gender, nickname: `${prefix}${i}`, photo_url: 'x', is_adult: true, onboarding_completed_at: new Date().toISOString() }).eq('user_id', data!.user!.id);
      }
      const { data: team } = await admin.from('team').insert({ owner_user_id: members[0], gender, target_size: size, status: 'ready', kind: 'user' }).select().single();
      teams.push(team!.id);
      await admin.from('team_member').insert(members.map((u) => ({ team_id: team!.id, user_id: u, role: u === members[0] ? 'owner' : 'member' })));
      const { data: q } = await admin.from('match_queue').insert({ team_id: team!.id, gender, required_gender: gender === 'male' ? 'female' : 'male', desired_size: size, status: 'waiting' }).select().single();
      queues.push(q!.id);
      return q!.id;
    }
    const qM = await mkTeamQueue('mt', 'male', 2);
    const qF = await mkTeamQueue('ft', 'female', 2);

    // 여팀이 먼저 대기 중, 남팀 enqueue 순간 try_match 호출 → 즉시 매칭
    const { data: gmId, error } = await admin.rpc('try_match', { p_queue_id: qM });
    expect(error).toBeNull();
    expect(gmId).toBeTruthy();

    const { data: qs } = await admin.from('match_queue').select('status').in('id', [qM, qF]);
    expect(qs!.every((q) => q.status === 'matched')).toBe(true);
    const { data: gm } = await admin.from('group_match').select('room_id').eq('id', gmId).single();
    const { count } = await admin.from('room_member').select('*', { count: 'exact', head: true }).eq('room_id', gm!.room_id);
    expect(count).toBe(4);

    await admin.from('room').delete().eq('id', gm!.room_id);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });
```

- [ ] **Step 2: Run to verify fail**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: FAIL — `try_match` does not exist.

- [ ] **Step 3: Write the RPC**

```sql
-- 20260602000040_try_match.sql
-- 명세 §4·§5. 큐 1건 기준 상대 후보를 Tier 완화로 찾아 매칭. solo merge 포함.
create or replace function public.try_match(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me record; cand record; v_tier int; v_waited int;
  v_my_ids uuid[]; v_other_ids uuid[]; v_gm uuid;
  v_side_max int := public.match_cfg_int('side_max',5);
  v_cap int := public.match_cfg_int('cell_cap',8);
begin
  -- gender-pair bucket advisory lock (동시 직렬화)
  perform pg_advisory_xact_lock(hashtext('match'));

  select q.*, t.target_size as t_size into me
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.id=p_queue_id and q.status='waiting' for update;
  if me is null then return null; end if;

  v_waited := floor(extract(epoch from (now()-me.enqueued_at))/60);
  v_tier := public._tier_of(v_waited);

  -- 후보: 반대 성별 waiting, region/tier 게이트, eff_prio 정렬
  select q.*, t.target_size as t_size, t.kind as t_kind into cand
    from public.match_queue q join public.team t on t.id=q.team_id
    where q.status='waiting'
      and q.gender = me.required_gender
      and q.team_id <> me.team_id
      and (q.expires_at is null or q.expires_at > now())
      -- Tier0: 정확일치 / Tier1+: 합<=cap & 각<=side_max / region: T2 전엔 같은지역 선호
      and (
        (v_tier = 0 and q.desired_size = me.desired_size)
        or (v_tier >= 1 and (q.desired_size + me.desired_size) <= v_cap
            and q.desired_size <= v_side_max and me.desired_size <= v_side_max)
      )
      and (
        v_waited >= public.match_cfg_int('tier2_minutes',120)
        or me.region is null or q.region is null or me.region = q.region
      )
    order by (me.region is not distinct from q.region) desc, public._match_boost(q.enqueued_at) asc
    limit 1 for update skip locked;

  if cand is null then
    -- Tier1+ & me 가 solo 면 동성 solo 들을 모아 상대에 맞춤 (solo merge)
    if v_tier >= 1 and me.desired_size = 1 then
      return public._try_solo_merge(me.id, me.gender, me.required_gender, v_waited);
    end if;
    return null;  -- 대기 잔류
  end if;

  -- 양측 멤버 수집
  select array_agg(tm.user_id) into v_my_ids from public.team_member tm where tm.team_id=me.team_id;
  select array_agg(tm.user_id) into v_other_ids from public.team_member tm where tm.team_id=cand.team_id;

  -- 매칭 성사
  v_gm := public.match_and_create(v_my_ids, me.gender, v_other_ids, cand.gender);
  if v_gm is null then return null; end if;
  update public.match_queue set status='matched', matched_at=now()
    where id in (me.id, cand.id) and status='waiting';
  return v_gm;
end $$;

-- solo merge: 같은 성별 waiting solo 들을 모아 상대 성별 solo/team 과 매칭 (3:3 등)
create or replace function public._try_solo_merge(p_seed uuid, p_gender text, p_req text, p_waited int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_my record[]; v_other record[]; my_ids uuid[]; other_ids uuid[]; r record;
  v_my_q uuid[]; v_other_q uuid[]; v_gm uuid;
  v_side_max int := public.match_cfg_int('side_max',5);
  v_need int;
begin
  -- 내 쪽 solo 풀 (seed 포함), eff_prio 순 최대 side_max
  my_ids := array[]::uuid[]; v_my_q := array[]::uuid[];
  for r in select q.id, tm.user_id from public.match_queue q
             join public.team t on t.id=q.team_id
             join public.team_member tm on tm.team_id=t.id
             where q.status='waiting' and q.gender=p_gender and q.desired_size=1
             order by public._match_boost(q.enqueued_at) asc limit v_side_max for update skip locked loop
    my_ids := my_ids || r.user_id; v_my_q := v_my_q || r.id;
  end loop;
  -- 상대 쪽 solo 풀
  other_ids := array[]::uuid[]; v_other_q := array[]::uuid[];
  for r in select q.id, tm.user_id from public.match_queue q
             join public.team t on t.id=q.team_id
             join public.team_member tm on tm.team_id=t.id
             where q.status='waiting' and q.gender=p_req and q.desired_size=1
             order by public._match_boost(q.enqueued_at) asc limit v_side_max for update skip locked loop
    other_ids := other_ids || r.user_id; v_other_q := v_other_q || r.id;
  end loop;
  -- 균형: 양측 min 으로 맞춤 (3:3 등). 최소 1:1.
  v_need := least(array_length(my_ids,1), array_length(other_ids,1));
  if v_need is null or v_need < 1 then return null; end if;
  my_ids := my_ids[1:v_need]; other_ids := other_ids[1:v_need];
  v_my_q := v_my_q[1:v_need]; v_other_q := v_other_q[1:v_need];

  v_gm := public.match_and_create(my_ids, p_gender, other_ids, p_req);
  if v_gm is null then return null; end if;
  update public.match_queue set status='matched', matched_at=now()
    where id = any(v_my_q || v_other_q) and status='waiting';
  return v_gm;
end $$;

revoke all on function public.try_match(uuid) from public, anon;
grant execute on function public.try_match(uuid) to authenticated;
revoke all on function public._try_solo_merge(uuid,text,text,int) from public, anon;
```

- [ ] **Step 4: Run to verify pass**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: PASS (Tier0 정확일치 즉시 매칭).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260602000040_try_match.sql apps/mobile/__tests__/integration/matching-rpc.test.ts
git commit -m "feat(db): try_match RPC — Tier 완화 페어링 + solo merge (빠른 매칭)"
```

---

## Task 5: solo merge / 비대칭 시나리오 테스트 (E3·E4·E6·E10)

**Files:**
- Modify (append): `apps/mobile/__tests__/integration/matching-rpc.test.ts`

> 새 코드 없음 — Task3·4 RPC를 시나리오로 관통. 헬퍼 `mkTeamQueue`를 파일 상단 공용으로 추출.

- [ ] **Step 1: Append scenarios**

```ts
  it('solo merge: 남 혼자×3 + 여 혼자×3 → 3:3 방 (4:4 고집 안 함)', async () => {
    const ids: string[] = [];
    async function mkSolo(prefix: string, gender: 'male'|'female') {
      const { data } = await admin.auth.admin.createUser({ email: `e2e-${prefix}@example.test`, password: 'pw-1234', email_confirm: true });
      ids.push(data!.user!.id);
      await admin.from('profile').update({ gender, nickname: prefix, photo_url: 'x', is_adult: true, onboarding_completed_at: new Date().toISOString() }).eq('user_id', data!.user!.id);
      const { data: team } = await admin.from('team').insert({ owner_user_id: data!.user!.id, gender, target_size: 1, status: 'ready', kind: 'user' }).select().single();
      await admin.from('team_member').insert({ team_id: team!.id, user_id: data!.user!.id, role: 'owner' });
      const { data: q } = await admin.from('match_queue').insert({ team_id: team!.id, gender, required_gender: gender === 'male' ? 'female' : 'male', desired_size: 1, status: 'waiting',
        enqueued_at: new Date(Date.now() - 40 * 60 * 1000).toISOString() }).select().single(); // 40분 전(Tier1)
      return q!.id;
    }
    const males = []; for (let i=0;i<3;i++) males.push(await mkSolo(`sm${i}`, 'male'));
    const females = []; for (let i=0;i<3;i++) females.push(await mkSolo(`sf${i}`, 'female'));

    const { data: gmId } = await admin.rpc('try_match', { p_queue_id: males[0] }); // solo merge 트리거
    expect(gmId).toBeTruthy();
    const { data: gm } = await admin.from('group_match').select('room_id').eq('id', gmId).single();
    const { count } = await admin.from('room_member').select('*', { count: 'exact', head: true }).eq('room_id', gm!.room_id);
    expect(count).toBe(6); // 3:3

    await admin.from('room').delete().eq('id', gm!.room_id);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  it('over-capacity 거부: side 6명 match_and_create → over_capacity', async () => {
    const six = Array.from({length:6}, (_,i)=>`00000000-0000-0000-0000-00000000000${i}`);
    const { error } = await admin.rpc('match_and_create', {
      p_side_a_user_ids: six, p_side_a_gender: 'male',
      p_side_b_user_ids: ['00000000-0000-0000-0000-0000000000aa'], p_side_b_gender: 'female',
    });
    expect(error?.message).toContain('over_capacity');
  });
```

- [ ] **Step 2: Run + verify pass**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: PASS (3:3 solo merge + over_capacity 거부).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/__tests__/integration/matching-rpc.test.ts
git commit -m "test(integration): solo merge 3:3 + over-capacity 거부 시나리오"
```

---

## Task 6: `match_sweep` + `expire_match_queue` + pg_cron

**Files:**
- Create: `supabase/migrations/20260602000050_match_sweep.sql`
- Create: `supabase/migrations/20260602000060_matching_cron.sql`
- Modify (append): `apps/mobile/__tests__/integration/matching-rpc.test.ts`

> 명세 §8. sweep = waiting 잔여를 주기 회수. pg_cron 으로 Supabase 내부 스케줄 — **앱·외부 의존 0.**

- [ ] **Step 1: Write the failing test (append)**

```ts
  it('match_sweep: 동시 도착해 즉시경로가 놓친 양측 대기 → sweep 가 매칭', async () => {
    // 양측 팀을 try_match 호출 없이 waiting 으로만 넣고 sweep 호출
    const ids: string[] = [];
    async function mkTeamQueueNoTrigger(prefix: string, gender: 'male'|'female') {
      const { data } = await admin.auth.admin.createUser({ email: `e2e-${prefix}@example.test`, password: 'pw-1234', email_confirm: true });
      ids.push(data!.user!.id);
      await admin.from('profile').update({ gender, nickname: prefix, photo_url: 'x', is_adult: true, onboarding_completed_at: new Date().toISOString() }).eq('user_id', data!.user!.id);
      const { data: team } = await admin.from('team').insert({ owner_user_id: data!.user!.id, gender, target_size: 1, status: 'ready', kind: 'user' }).select().single();
      await admin.from('team_member').insert({ team_id: team!.id, user_id: data!.user!.id, role: 'owner' });
      await admin.from('match_queue').insert({ team_id: team!.id, gender, required_gender: gender === 'male' ? 'female' : 'male', desired_size: 1, status: 'waiting' });
    }
    await mkTeamQueueNoTrigger('swm', 'male');
    await mkTeamQueueNoTrigger('swf', 'female');

    const { data: matched } = await admin.rpc('match_sweep');
    expect(matched).toBeGreaterThanOrEqual(1);

    // cleanup: 생성된 room 들 정리
    const { data: rooms } = await admin.from('room_member').select('room_id').in('user_id', ids);
    for (const r of rooms ?? []) await admin.from('room').delete().eq('id', r.room_id);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });
```

- [ ] **Step 2: Run to verify fail**

Run: `RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: FAIL — `match_sweep` does not exist.

- [ ] **Step 3: Write sweep + expire**

```sql
-- 20260602000050_match_sweep.sql
create or replace function public.match_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare e record; v_matched int := 0; v_res uuid;
begin
  for e in select id from public.match_queue
             where status='waiting'
               and (last_tried_at is null or last_tried_at < now() - interval '10 seconds')
             order by public._match_boost(enqueued_at) asc
             limit 200 for update skip locked loop
    update public.match_queue set last_tried_at=now() where id=e.id;
    v_res := public.try_match(e.id);
    if v_res is not null then v_matched := v_matched + 1; end if;
  end loop;
  return v_matched;
end $$;

create or replace function public.expire_match_queue()
returns int language plpgsql security definer set search_path = public as $$
declare v_cnt int;
begin
  update public.match_queue set status='expired'
    where status='waiting' and expires_at is not null and expires_at < now();
  get diagnostics v_cnt = row_count;
  update public.team set status='forming'
    where status='ready' and id in (select team_id from public.match_queue where status='expired');
  return v_cnt;
end $$;

revoke all on function public.match_sweep() from public, anon;
revoke all on function public.expire_match_queue() from public, anon;
grant execute on function public.match_sweep() to service_role;
grant execute on function public.expire_match_queue() to service_role;
```

- [ ] **Step 4: Write pg_cron migration**

```sql
-- 20260602000060_matching_cron.sql
-- Supabase 내부 스케줄러. 앱/외부 cron 의존 0. (Supabase 는 pg_cron 지원)
create extension if not exists pg_cron with schema extensions;

-- sweep: 45초마다 (pg_cron 최소단위가 1분이므로, 1분 주기 + 내부에서 충분). 명세 SWEEP_INTERVAL_SEC.
select cron.schedule('match-sweep', '* * * * *', $$ select public.match_sweep(); $$);
-- expire: 5분마다
select cron.schedule('match-expire', '*/5 * * * *', $$ select public.expire_match_queue(); $$);
```

> 주: pg_cron 최소 주기가 1분이라 sweep 는 1분 주기. 더 빠른 회수가 필요하면 즉시경로(try_match)가 대부분 흡수하므로 1분 sweep 로 충분. (초단위가 꼭 필요하면 함수 내 loop 또는 Supabase scheduled Edge 검토 — 후속.)

- [ ] **Step 5: Apply + run test**

Run: `pnpm db:reset && RUN_INTEGRATION=1 pnpm -F mobile test:integration matching-rpc`
Expected: PASS (sweep 매칭). pg_cron 등록 확인: `select jobname from cron.job;` → match-sweep, match-expire.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260602000050_match_sweep.sql supabase/migrations/20260602000060_matching_cron.sql apps/mobile/__tests__/integration/matching-rpc.test.ts
git commit -m "feat(db): match_sweep/expire RPC + pg_cron 스케줄 (Supabase 내부, 앱 비의존)"
```

---

## Task 7: enqueue Edge 에 try_match 연동 (config 게이트)

**Files:**
- Modify: `supabase/functions/enqueue-match-queue/index.ts`

> 큐 적재 직후, `match_config.automation='auto_immediate'`일 때만 try_match 호출. manual 이면 큐만 쌓임(현 MVP 유지). **앱 무관 — 토글은 DB.**

- [ ] **Step 1: Locate the insert + add trigger**

`enqueue-match-queue/index.ts`에서 `match_queue` insert 직후(현재 `jsonResponse`로 'queued' 반환하는 지점) 앞에 추가:

```ts
    // 큐 적재 (기존). insertedQueue.id 확보.
    const { data: insertedQueue, error: insErr } = await supabase
      .from('match_queue')
      .insert({
        team_id: teamId, gender: ownerProfile.gender,
        required_gender: ownerProfile.gender === 'male' ? 'female' : 'male',
        desired_size: targetSize, region: ownerProfile.region ?? null,
        status: 'waiting', expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .select('id')
      .single();
    if (insErr || !insertedQueue) throw insErr ?? new Error('enqueue failed');

    // 자동 즉시 매칭 (config 게이트 — 앱 재빌드 없이 DB 토글)
    const { data: cfg } = await supabase.from('match_config').select('value').eq('key', 'automation').maybeSingle();
    const automation = typeof cfg?.value === 'string' ? cfg.value : (cfg?.value ?? 'manual_admin_curation');
    let matchId: string | null = null;
    if (automation === 'auto_immediate' || automation === 'auto_scored') {
      const { data: gm } = await supabase.rpc('try_match', { p_queue_id: insertedQueue.id });
      matchId = (gm as string | null) ?? null;
    }

    if (matchId) {
      const { data: gm } = await supabase.from('group_match').select('room_id').eq('id', matchId).single();
      return jsonResponse({ matched: true, matchId, roomId: gm?.room_id, queueId: insertedQueue.id });
    }
    return jsonResponse({ matched: false, status: 'queued', queueId: insertedQueue.id });
```

> `supabase`(service-role admin)로 try_match 호출 — sweep 와 동일 경로. (RPC는 security definer라 service_role OK.) 기존 enqueue의 team 생성·게이트 로직은 그대로 둔다. `targetSize`/`teamId`는 기존 코드의 변수명에 맞춰 조정.

- [ ] **Step 2: Local serve sanity**

Run: `supabase functions serve enqueue-match-queue --no-verify-jwt` (기동 확인, Ctrl-C). 또는 `deno check supabase/functions/enqueue-match-queue/index.ts`.
Expected: 타입/기동 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/enqueue-match-queue/index.ts
git commit -m "feat(edge): enqueue 직후 try_match 자동 매칭 (match_config 게이트, 앱 비의존)"
```

---

## Task 8: 배포 산출물 + 실DB e2e (앱 동일 경로)

**Files:**
- Create: `scripts/e2e-matching-realdb.mjs`

> 명세 §10. 앱이 실제 타는 `functions.invoke('enqueue-match-queue')` 경로로 매칭 관통. 전용 유저 실 JWT, try/finally cleanup.

- [ ] **Step 1: Write the e2e script**

```js
// scripts/e2e-matching-realdb.mjs
import { createClient } from '@supabase/supabase-js';
const URL = process.env.DEI_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.DEI_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.DEI_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('env 누락'); process.exit(2); }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const created = []; const rooms = []; const results = [];
const log = (n, ok, note='') => { results.push({n,ok}); console.log(`${ok?'✅':'❌'} ${n} ${note}`); };

async function mkUserClient(email, gender) {
  const { data } = await admin.auth.admin.createUser({ email, password: 'pw-1234', email_confirm: true });
  created.push(data.user.id);
  await admin.from('profile').update({ gender, nickname: email.split('@')[0], photo_url: 'x', is_adult: true, onboarding_completed_at: new Date().toISOString() }).eq('user_id', data.user.id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: 'pw-1234' });
  // team(size1) + member
  const { data: team } = await admin.from('team').insert({ owner_user_id: data.user.id, gender, target_size: 1, status: 'ready', kind: 'user' }).select().single();
  await admin.from('team_member').insert({ team_id: team.id, user_id: data.user.id, role: 'owner' });
  return { id: data.user.id, c, teamId: team.id };
}

async function main() {
  // automation=auto_immediate 로 전환(테스트 동안)
  await admin.from('match_config').update({ value: '"auto_immediate"' }).eq('key', 'automation');

  const F = await mkUserClient('e2e-match-f@example.test', 'female');
  const M = await mkUserClient('e2e-match-m@example.test', 'male');

  // 여성 먼저 enqueue(대기) → 남성 enqueue 순간 즉시 매칭 (앱 동일 functions.invoke)
  await F.c.functions.invoke('enqueue-match-queue', { body: { team_id: F.teamId } });
  const r = await M.c.functions.invoke('enqueue-match-queue', { body: { team_id: M.teamId } });
  log('E-immediate enqueue→즉시매칭', r.data?.matched === true && !!r.data?.roomId, JSON.stringify(r.data ?? r.error));
  if (r.data?.roomId) {
    rooms.push(r.data.roomId);
    const { count } = await admin.from('room_member').select('*', { count:'exact', head:true }).eq('room_id', r.data.roomId);
    log('E-immediate 1:1 방 2명', count === 2);
  }
}
main().catch((e)=>{console.error('FATAL',e);process.exitCode=1;}).finally(async()=>{
  await admin.from('match_config').update({ value: '"manual_admin_curation"' }).eq('key', 'automation'); // 원복
  for (const r of rooms) await admin.from('room').delete().eq('id', r);
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const p = results.filter(r=>r.ok).length;
  console.log(`\n=== 매칭 실DB e2e: ${p}/${results.length} PASS ===`);
  if (results.length===0 || p<results.length) process.exitCode = 1;
});
```

- [ ] **Step 2: 배포 + 실행**

Run:
```bash
export PATH="$HOME/.local/bin:$PATH" && source ~/.dei/secrets.env
supabase db push
supabase functions deploy enqueue-match-queue
supabase functions list   # enqueue-match-queue ACTIVE 확인
node scripts/e2e-matching-realdb.mjs
```
Expected: E-immediate PASS (enqueue→즉시 1:1 매칭, room_member 2). cleanup 후 BASELINE==AFTER.

- [ ] **Step 3: gate + commit**

Run: `pnpm verify`
Expected: ds-enforce→typecheck→unit→component→integration GREEN.

```bash
git add scripts/e2e-matching-realdb.mjs
git commit -m "test(e2e): 매칭 실DB e2e (앱 functions.invoke 경로, 즉시 매칭 관통)"
```

- [ ] **Step 4: 보고**

"①배포(db push + functions deploy enqueue-match-queue + pg_cron 등록) ②env ③앱 동일 functions.invoke 경로로 enqueue→즉시매칭 검증. 매칭 로직 전부 Supabase(RPC+cron+Edge) — 앱 재빌드 0." 못 한 항목(부하/대량 동시성) 명시.

---

## Self-Review

**Spec coverage (ALGORITHM-SPEC §→task):**
- §1 상수/§2 스키마 → Task1 (match_config로 런타임 토글 = 앱 비의존) ✅
- §3 enqueue 경로 → Task7 ✅
- §4 try_match → Task4 ✅
- §5 build_match_plan/Tier/solo merge → Task4(_try_solo_merge) + Task5 시나리오 ✅
- §6 region soft → Task4 쿼리(tier2 전 region 선호) ✅
- §7 match_and_create → Task3 ✅
- §8 sweep/expire/cron → Task6 ✅
- §9 동시성 → Task3·4(advisory lock, SKIP LOCKED, unique, canonical) ✅
- §10 e2e 10시나리오 → Task5(E3·E10) + Task8(E-immediate). **갭: E5(over-cap)=Task5 / E6 동시성·E7 기아·E8 공급0·E9 already-in-room 은 통합테스트로 미작성 → 후속 task로 추가 권장(명시).**
- §11 롤아웃 → match_config.automation 플래그(Task1·7) ✅
- 앱 배포 비의존 → 전 task 가 마이그레이션/RPC/Edge/cron + match_config 토글, 앱 화면 변경 0 ✅

**Placeholder scan:** 코드 스텝 전부 실제 SQL/TS. (enqueue Edge의 기존 변수명 `teamId`/`targetSize`는 "기존 코드에 맞춰 조정" 명시 — 실행 시 실제 파일 확인 가드.)

**Type consistency:** `try_match(p_queue_id)` / `match_and_create(p_side_a_user_ids, p_side_a_gender, p_side_b_user_ids, p_side_b_gender)` / `match_sweep()` / `expire_match_queue()` 시그니처가 Task3·4·6·7·8 전반 일치. match_config key('automation','tier1_minutes'...) 일관.

> **갭 메모:** E6(동시성 race)·E7(기아 sweep 회수)·E8(공급0 expire)·E9(already-in-room 제외) 통합 테스트는 이 플랜에 미포함 — 핵심 경로(즉시·solo merge·over-cap·sweep) 검증 후 후속 Task로 추가. pg_cron 초단위 미지원(1분 최소)은 즉시경로가 대부분 흡수해 수용 가능, 더 빠른 회수 필요 시 Supabase scheduled Edge 검토(후속).

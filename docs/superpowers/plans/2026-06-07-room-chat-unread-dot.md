# 방 채팅 버튼 unread 점 조건부 표시 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 화면 상단 채팅 버튼의 빨간 점을, 내가 안 읽은 신규 메시지가 있을 때만 표시한다.

**Architecture:** 서버 read marker 방식. `room_member.last_read_at`(timestamptz) 컬럼 + `mark_room_read` RPC 추가. 채팅 화면 진입 시 읽음 시각을 `now()`로 갱신하고, 방 화면은 "내가 안 보낸·나에게 보이는 최신 메시지 시각 > last_read_at" 이면 점을 표시한다.

**Tech Stack:** Supabase(Postgres RPC, RLS), `@supabase/supabase-js`, React Native / expo-router, Vitest(unit + 실DB integration), `@dei/ui` Badge, `@dei/shared` logger.

**Spec:** `docs/superpowers/specs/2026-06-07-room-chat-unread-dot-design.md`

---

## 파일 구조 (생성/수정 맵)

| 파일 | 책임 | 종류 |
|------|------|------|
| `supabase/migrations/20260607000010_room_member_last_read.sql` | `last_read_at` 컬럼 + `mark_room_read` RPC | 생성 |
| `packages/api/src/database.types.ts` | DB 타입(자동 생성 반영) | 수정(재생성) |
| `apps/mobile/lib/chat/unread.ts` | `hasUnread()` 순수 판정 함수 | 생성 |
| `apps/mobile/lib/chat/__tests__/unread.test.ts` | 순수 함수 unit 테스트 | 생성 |
| `apps/mobile/hooks/useRoomUnread.ts` | unread 상태 훅(조회+realtime+focus 보정) | 생성 |
| `apps/mobile/app/(app)/room/[roomId]/chat.tsx` | 진입 시 `mark_room_read` 호출 | 수정 |
| `apps/mobile/app/(app)/room/[roomId]/index.tsx` | 점 조건부 렌더 | 수정 |
| `apps/mobile/__tests__/integration/room-unread.integration.test.ts` | 실DB e2e | 생성 |

---

## Task 1: DB 마이그레이션 — last_read_at 컬럼 + mark_room_read RPC

**Files:**
- Create: `supabase/migrations/20260607000010_room_member_last_read.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260607000010_room_member_last_read.sql`:

```sql
-- 20260607000010_room_member_last_read.sql
-- 방 채팅 unread 점: 사용자별 "마지막 읽음 시각" read marker.
-- last_read_at IS NULL = 아직 한 번도 채팅을 안 봄(미읽음). DEFAULT 없음 의도적.
-- mark_room_read 는 send_room_message 와 동일 패턴(authenticated grant,
-- security definer, auth.uid() 본인 + room_is_member 가드).

alter table public.room_member add column last_read_at timestamptz;

create or replace function public.mark_room_read(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.room_is_member(p_room_id, v_uid) then
    raise exception 'not_room_member' using errcode = '42501';
  end if;
  update public.room_member
    set last_read_at = now()
    where room_id = p_room_id and user_id = v_uid;
end $$;

revoke all on function public.mark_room_read(uuid) from public, anon;
grant execute on function public.mark_room_read(uuid) to authenticated;
```

- [ ] **Step 2: 마이그레이션 적용 + 검증**

Run:
```bash
pnpm db:reset
```
Expected: 에러 없이 모든 마이그레이션 적용. 출력 끝에 실패 메시지 없음.

확인:
```bash
pnpm db:start >/dev/null 2>&1; psql "$(supabase status -o env 2>/dev/null | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d public.room_member" 2>/dev/null | grep last_read_at
```
Expected: `last_read_at | timestamp with time zone` 라인이 출력됨.
(psql 환경이 없으면 Step 2 확인은 Task 6 실DB e2e 로 대체 — 거기서 컬럼/RPC 실존이 강제 검증된다.)

- [ ] **Step 3: 타입 재생성**

Run:
```bash
pnpm db:gen-types
```
Expected: `packages/api/src/database.types.ts` 가 갱신되고 `last_read_at` / `mark_room_read` 가 포함됨.

확인:
```bash
grep -c "last_read_at\|mark_room_read" packages/api/src/database.types.ts
```
Expected: `0` 보다 큰 수.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260607000010_room_member_last_read.sql packages/api/src/database.types.ts
git commit -m "feat(db): room_member.last_read_at + mark_room_read RPC (chat unread)"
```

---

## Task 2: unread 순수 판정 함수 (TDD)

**Files:**
- Create: `apps/mobile/lib/chat/unread.ts`
- Test: `apps/mobile/lib/chat/__tests__/unread.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/lib/chat/__tests__/unread.test.ts`:

```ts
// apps/mobile/lib/chat/__tests__/unread.test.ts
import { describe, expect, it } from 'vitest';
import { hasUnread } from '../unread';

describe('hasUnread', () => {
  it('남의 메시지가 없으면 false', () => {
    expect(hasUnread(null, null)).toBe(false);
    expect(hasUnread(null, '2026-06-07T00:00:00Z')).toBe(false);
  });

  it('남의 메시지가 있고 한 번도 안 읽었으면(last_read=null) true', () => {
    expect(hasUnread('2026-06-07T00:00:00Z', null)).toBe(true);
  });

  it('마지막 읽음 이후 생성된 남의 메시지가 있으면 true', () => {
    expect(hasUnread('2026-06-07T00:00:10Z', '2026-06-07T00:00:00Z')).toBe(true);
  });

  it('마지막 읽음 이후 새 남의 메시지가 없으면 false (이전/동일)', () => {
    expect(hasUnread('2026-06-07T00:00:00Z', '2026-06-07T00:00:10Z')).toBe(false);
    expect(hasUnread('2026-06-07T00:00:00Z', '2026-06-07T00:00:00Z')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
pnpm -F mobile exec vitest run lib/chat/__tests__/unread.test.ts
```
Expected: FAIL — `Cannot find module '../unread'` (또는 `hasUnread is not a function`).

- [ ] **Step 3: 최소 구현 작성**

`apps/mobile/lib/chat/unread.ts`:

```ts
// apps/mobile/lib/chat/unread.ts
// 방 채팅 unread 점 판정(순수 함수).
//  - latestOthersMessageAt: "내가 안 보낸, 나에게 보이는" 메시지 중 최신 created_at(ISO). 없으면 null.
//  - lastReadAt: room_member.last_read_at(ISO). 한 번도 안 읽었으면 null.
// RLS가 가시성(귓속말·차단)을 이미 필터하므로 여기선 시각 비교만 한다.
export function hasUnread(
  latestOthersMessageAt: string | null,
  lastReadAt: string | null,
): boolean {
  if (latestOthersMessageAt == null) return false;
  if (lastReadAt == null) return true;
  return new Date(latestOthersMessageAt).getTime() > new Date(lastReadAt).getTime();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm -F mobile exec vitest run lib/chat/__tests__/unread.test.ts
```
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/chat/unread.ts apps/mobile/lib/chat/__tests__/unread.test.ts
git commit -m "feat(chat): hasUnread 순수 판정 함수 + unit"
```

---

## Task 3: useRoomUnread 훅

**Files:**
- Create: `apps/mobile/hooks/useRoomUnread.ts`

> 이 훅은 supabase/realtime 부수효과 + RN focus 라 unit 테스트 대상이 아니다(순수
> 판정은 Task 2 가 커버, 관통은 Task 6 실DB e2e 가 커버). 따라서 TDD 가 아닌
> 직접 구현 + typecheck 로 검증한다.

- [ ] **Step 1: 훅 구현 작성**

`apps/mobile/hooks/useRoomUnread.ts`:

```ts
// apps/mobile/hooks/useRoomUnread.ts
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomMessages } from '@/lib/realtime';
import { hasUnread } from '@/lib/chat/unread';

/**
 * 방 화면 채팅 버튼의 unread 점 상태.
 *  - 진입/재포커스 시 본인 room_member.last_read_at 조회(채팅 보고 오면 점 사라짐).
 *  - "내가 안 보낸 최신 메시지" 시각을 초기 1회 + realtime 으로 추적.
 *  - 조회 실패는 회복 가능(점 부정확) → 캡처만, 기본은 "점 숨김"(미탐) 안전측.
 */
export function useRoomUnread(roomId: string | undefined, selfId: string | null) {
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [latestOthersAt, setLatestOthersAt] = useState<string | null>(null);

  // 본인 last_read_at 조회(진입 + 재포커스). 채팅에서 돌아오면 갱신 → 점 사라짐.
  const refetchLastRead = useCallback(async () => {
    if (!roomId || !selfId) return;
    const { data, error } = await supabase
      .from('room_member')
      .select('last_read_at')
      .eq('room_id', roomId)
      .eq('user_id', selfId)
      .maybeSingle();
    if (error) {
      logger.captureException(error, {
        tags: { feature: 'chat-unread', step: 'last-read', room_id: roomId },
      });
      return;
    }
    setLastReadAt((data?.last_read_at as string | null) ?? null);
  }, [roomId, selfId]);

  useFocusEffect(
    useCallback(() => {
      void refetchLastRead();
    }, [refetchLastRead]),
  );

  // "내가 안 보낸" 최신 메시지 시각: 초기 1회 조회.
  useEffect(() => {
    if (!roomId || !selfId) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('message')
        .select('created_at,user_id')
        .eq('room_id', roomId)
        .neq('user_id', selfId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!alive) return;
      if (error) {
        logger.captureException(error, {
          tags: { feature: 'chat-unread', step: 'latest-others', room_id: roomId },
        });
        return;
      }
      const latest = data?.[0]?.created_at as string | undefined;
      if (latest) setLatestOthersAt((prev) => (prev && prev > latest ? prev : latest));
    })();
    return () => {
      alive = false;
    };
  }, [roomId, selfId]);

  // realtime: 들어온 메시지가 "남의 것"이면 최신 시각 갱신.
  useEffect(() => {
    if (!roomId || !selfId) return;
    const unsub = subscribeRoomMessages(roomId, (row) => {
      if (String(row.user_id) === selfId) return;
      const at = row.created_at as string | undefined;
      if (!at) return;
      setLatestOthersAt((prev) => (prev && prev > at ? prev : at));
    });
    return unsub;
  }, [roomId, selfId]);

  return { hasUnread: hasUnread(latestOthersAt, lastReadAt) };
}
```

- [ ] **Step 2: typecheck**

Run:
```bash
pnpm -F mobile exec tsc --noEmit
```
Expected: 에러 0건. (`subscribeRoomMessages` 시그니처·`@/lib/chat/unread` 임포트가 맞는지 확인됨.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/hooks/useRoomUnread.ts
git commit -m "feat(chat): useRoomUnread 훅 (last_read 조회 + realtime + focus 보정)"
```

---

## Task 4: 채팅 화면 진입 시 mark_room_read 호출

**Files:**
- Modify: `apps/mobile/app/(app)/room/[roomId]/chat.tsx` (selfId 동기화 useEffect 직후, 약 L99 아래)

- [ ] **Step 1: 진입 마킹 useEffect 추가**

`chat.tsx` 의 다음 기존 블록(약 L97–99):

```tsx
  useEffect(() => {
    if (user?.id) setSelfId(user.id);
  }, [user?.id]);
```

바로 아래에 추가:

```tsx
  // 채팅 화면 진입 시 읽음 마킹 → 방 화면 unread 점 사라짐. 실패해도 채팅은
  // 정상 동작(점이 안 사라질 뿐) → 회복 가능, 비동기 경계만 보호하고 캡처만.
  useEffect(() => {
    if (!roomId || !user?.id) return;
    void logger
      .withErrorCapture(
        'room.mark-read',
        async () => {
          const { error } = await supabase.rpc('mark_room_read', { p_room_id: roomId });
          if (error) throw error;
        },
        { tags: { feature: 'chat-unread', room_id: roomId } },
      )
      .catch(() => {});
  }, [roomId, user?.id]);
```

> `logger`, `supabase`, `useEffect` 는 chat.tsx 가 이미 임포트하고 있다(L1–6 확인). 추가 임포트 불필요.

- [ ] **Step 2: typecheck**

Run:
```bash
pnpm -F mobile exec tsc --noEmit
```
Expected: 에러 0건. (`supabase.rpc('mark_room_read', ...)` 가 Task 1 재생성 타입으로 인식됨.)

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(app)/room/[roomId]/chat.tsx"
git commit -m "feat(chat): 채팅 진입 시 mark_room_read 호출"
```

---

## Task 5: 방 화면 점 조건부 렌더

**Files:**
- Modify: `apps/mobile/app/(app)/room/[roomId]/index.tsx`
  - import 추가(약 L44 근처, 다른 hooks import 옆)
  - 훅 호출(컴포넌트 본문, `user` 사용 가능한 위치)
  - 점 렌더(L796–798)

- [ ] **Step 1: import 추가**

`index.tsx` 의 hooks import 그룹(예: `useRoomEndedDetector` 임포트 줄 근처)에 추가:

```tsx
import { useRoomUnread } from '@/hooks/useRoomUnread';
```

- [ ] **Step 2: 훅 호출 추가**

컴포넌트 본문에서 `user` 가 이미 선언된 이후(예: `const { onlineUserIds } = useRoomPresence(...)` 줄 근처)에 추가:

```tsx
  const { hasUnread } = useRoomUnread(roomId, user?.id ?? null);
```

- [ ] **Step 3: 점 조건부 렌더로 교체**

기존(L796–798):

```tsx
                  <View className="absolute top-[2px] right-[2px]">
                    <Badge variant="dot" />
                  </View>
```

교체:

```tsx
                  {hasUnread ? (
                    <View className="absolute top-[2px] right-[2px]">
                      <Badge variant="dot" />
                    </View>
                  ) : null}
```

- [ ] **Step 4: typecheck + lint**

Run:
```bash
pnpm -F mobile exec tsc --noEmit && pnpm lint
```
Expected: 둘 다 에러 0건.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(app)/room/[roomId]/index.tsx"
git commit -m "feat(room): 채팅 버튼 unread 점 조건부 렌더"
```

---

## Task 6: 실DB e2e (앱과 동일 RPC 경로)

**Files:**
- Create: `apps/mobile/__tests__/integration/room-unread.integration.test.ts`

> 패턴은 기존 `apps/mobile/__tests__/integration/send-message-rpc.test.ts` 와 동일:
> service-role admin 으로 테스트 유저 2명 생성 → 각자 user-JWT 클라이언트 →
> 실제 `send_room_message`/`mark_room_read` RPC 로 관통 → `try/finally` 전량 cleanup.

- [ ] **Step 1: 실DB e2e 테스트 작성**

`apps/mobile/__tests__/integration/room-unread.integration.test.ts`:

```ts
// apps/mobile/__tests__/integration/room-unread.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';
import { hasUnread } from '@/lib/chat/unread';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

let run = false;
let admin: SupabaseClient;
const created: string[] = []; // user ids for cleanup
let roomId = '';
let userA: { id: string; client: SupabaseClient };
let userB: { id: string; client: SupabaseClient };

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'test-pass-1234', email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: 'test-pass-1234' });
  return { id: data.user.id, client };
}

// 앱과 동일 경로: 본인 user-JWT 클라로 last_read_at 조회.
async function readLastReadAt(
  client: SupabaseClient,
  rid: string,
  uid: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('room_member')
    .select('last_read_at')
    .eq('room_id', rid)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return (data?.last_read_at as string | null) ?? null;
}

// 앱과 동일 경로: 본인 user-JWT 클라로 "내가 안 보낸" 최신 메시지 시각.
async function readLatestOthersAt(
  client: SupabaseClient,
  rid: string,
  uid: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('message')
    .select('created_at,user_id')
    .eq('room_id', rid)
    .neq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
  userA = await makeUser('e2e-unread-a@example.test');
  userB = await makeUser('e2e-unread-b@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room!.id;
  await admin.from('room_member').insert([
    { room_id: roomId, user_id: userA.id, status: 'active' },
    { room_id: roomId, user_id: userB.id, status: 'active' },
  ]);
});

afterAll(async () => {
  if (!run) return;
  await admin.from('room').delete().eq('id', roomId); // message/room_member cascade
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)(
  'room unread read-marker (real RLS + RPC)',
  () => {
    it('B가 메시지 전송 → A는 미읽음(last_read=null) → hasUnread true', async () => {
      const { error } = await userB.client.rpc('send_room_message', {
        p_room_id: roomId, p_body: '안녕 A', p_whisper_to_user_id: null,
        p_client_msg_id: crypto.randomUUID(),
      });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(lastRead).toBeNull();
      expect(latestOthers).not.toBeNull();
      expect(hasUnread(latestOthers, lastRead)).toBe(true);
    });

    it('A가 mark_room_read 호출 → last_read_at 갱신 → hasUnread false', async () => {
      const { error } = await userA.client.rpc('mark_room_read', { p_room_id: roomId });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(lastRead).not.toBeNull();
      expect(hasUnread(latestOthers, lastRead)).toBe(false);
    });

    it('B가 새 메시지 전송 → A hasUnread 다시 true', async () => {
      // mark_room_read(now())와 다음 메시지 created_at(now())의 동일초 경합 방지.
      await new Promise((r) => setTimeout(r, 1100));
      const { error } = await userB.client.rpc('send_room_message', {
        p_room_id: roomId, p_body: '또 왔어', p_whisper_to_user_id: null,
        p_client_msg_id: crypto.randomUUID(),
      });
      expect(error).toBeNull();

      const lastRead = await readLastReadAt(userA.client, roomId, userA.id);
      const latestOthers = await readLatestOthersAt(userA.client, roomId, userA.id);
      expect(hasUnread(latestOthers, lastRead)).toBe(true);
    });

    it('비멤버는 mark_room_read 거절(not_room_member)', async () => {
      const outsider = await makeUser('e2e-unread-out@example.test');
      const { error } = await outsider.client.rpc('mark_room_read', { p_room_id: roomId });
      expect(error?.message).toContain('not_room_member');
    });
  },
);
```

- [ ] **Step 2: 로컬 supabase 시작 후 실DB e2e 실행**

Run:
```bash
pnpm db:start && RUN_INTEGRATION=1 pnpm -F mobile exec vitest run __tests__/integration/room-unread.integration.test.ts
```
Expected: 4 tests passed. (service-role 키가 `~/.dei/secrets.env` 에 있어야 함 — `source` 후 실행. 메모리 `dei-supabase-secrets-location` 참고.)

> 만약 `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 skip 되면 그건 검증이 아니다(CLAUDE.md Testing 3). 반드시 키를 주입해 실제 실행 케이스가 0이 아니게 한다.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/__tests__/integration/room-unread.integration.test.ts
git commit -m "test(integration): 채팅 unread read-marker 실DB e2e (send/mark RPC 관통)"
```

---

## Task 7: 전체 검증 게이트

**Files:** 없음(검증만)

- [ ] **Step 1: typecheck**

Run:
```bash
pnpm -F mobile exec tsc --noEmit
```
Expected: 에러 0건.

- [ ] **Step 2: lint**

Run:
```bash
pnpm lint
```
Expected: 에러 0건.

- [ ] **Step 3: unit + component**

Run:
```bash
pnpm test
```
Expected: 전부 통과(특히 `unread.test.ts` 4건 포함).

- [ ] **Step 4: 실DB integration (Docker/키 있을 때)**

Run:
```bash
pnpm db:start && RUN_INTEGRATION=1 pnpm test:integration
```
Expected: `room-unread` 포함 모든 integration 통과, 실행 케이스 0건 아님.

> Docker/키 없으면 이 단계는 로컬에서 정직하게 NOT-RUN. CI(verify 게이트)가 강제.

---

## Self-Review (작성자 점검 완료)

**1. Spec coverage:**
- 컬럼 + RPC → Task 1 ✅
- 타입 재생성 → Task 1 Step 3 ✅
- `hasUnread` 순수 함수 → Task 2 ✅
- useRoomUnread(조회+realtime+focus 보정) → Task 3 ✅
- 진입 시 mark_room_read → Task 4 ✅
- 점 조건부 렌더 → Task 5 ✅
- 실DB e2e(전용 유저·실 JWT·send/mark RPC·try/finally cleanup) → Task 6 ✅
- 검증 게이트 → Task 7 ✅
- 귓속말 포함(self 제외만, RLS가 가시성 필터) → Task 3/6 의 `neq('user_id', selfId)` 로 반영, whisper 필터 안 검 ✅
- 안전측 기본값(실패 시 점 숨김) → Task 3 의 캡처-후-상태유지(latestOthersAt 미갱신 → hasUnread false) ✅

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 블록 완전. ✅

**3. Type consistency:** `hasUnread(latestOthersMessageAt, lastReadAt)` 시그니처가 Task 2 정의 ↔ Task 3 호출 ↔ Task 6 호출에서 동일(인자 순서 동일). `mark_room_read(p_room_id)` / `send_room_message(p_room_id, p_body, p_whisper_to_user_id, p_client_msg_id)` 파라미터명이 Task 1 SQL ↔ Task 4/6 호출에서 동일. ✅

**4. 사람이 확인할 점(구현 중 임의판단 위험):**
- `index.tsx` 의 import/훅 호출 삽입 위치는 "근처"로 기술 — 정확한 줄은 구현 시 실제 코드 보고 배치(공유 파일이라 충돌 주의).
- 실DB e2e 의 동일초 경합 방지를 위해 1.1s sleep 사용(Task 6). created_at/now() 초단위 비교라 의도적.

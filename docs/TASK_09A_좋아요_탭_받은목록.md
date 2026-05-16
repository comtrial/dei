# TASK · 09A 좋아요 탭 + 받은 좋아요 목록 (LK1~LK4)

> **작업 범위**: 좋아요 화면 진입점 — 받은/보낸 세그먼트 탭, 받은 좋아요 목록 및 빈 상태
> **선행 작업**: `likes` 테이블 스키마 확장 (이 TASK가 마이그레이션 포함) / `TASK_05_홈_큐레이션_H2.md`의 좋아요 발송 흐름 이해
> **후속 작업**: `TASK_09B_받은좋아요_수락거절_매칭.md` (LK5~LK8) / `TASK_09C_보낸좋아요_발송.md` (LK9~LK12)
> **담당**: 손승태 · collaborator 최승원 (likes lifecycle RPC)
> **우선순위**: P0
> **Supabase 테이블**: `likes` (확장), `users`, `logs`
> **기획서 참조**: PDF Preview (7), §4.3, §4.4

---

## 📐 구현 대상

| ID | 타입 | 화면 / 동작 |
|----|------|------------|
| LK1 | screen | 좋아요 탭 (세그먼트: 받은 / 보낸) |
| LK2 | db    | 좋아요 목록 조회 (받은/보낸 공통) |
| LK3 | screen | 받은 좋아요 목록 |
| LK4 | screen | 받은 좋아요 빈 상태 |

> LK1~LK4는 한 라우트(`/(app)/likes` — 기존 `matches.tsx`를 리네임/확장) 안에서 세그먼트 탭으로 분리. LK9(보낸 좋아요 목록)는 같은 화면의 다른 탭이며 `TASK_09C`에서 구현.

---

## 🗄️ likes 스키마 확장 (마이그레이션 포함)

현재 `likes` 테이블에는 `id / from_user_id / to_user_id / liked_at / created_at`만 있다 (`docs/DB_스키마.md`). PDF Preview (7)이 요구하는 lifecycle을 지원하려면 다음 컬럼이 필요하다.

```sql
-- supabase/migrations/20260514000010_likes_lifecycle.sql

ALTER TABLE public.likes
  ADD COLUMN status text NOT NULL
    DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  ADD COLUMN expires_at timestamptz NOT NULL
    DEFAULT (now() + interval '7 days'),
  ADD COLUMN attached_log_id uuid REFERENCES public.logs(id) ON DELETE SET NULL,
  ADD COLUMN read_at timestamptz,
  ADD COLUMN responded_at timestamptz;

-- 조회 효율
CREATE INDEX likes_to_user_status_idx
  ON public.likes (to_user_id, status, liked_at DESC);
CREATE INDEX likes_from_user_status_idx
  ON public.likes (from_user_id, status, liked_at DESC);

-- 받은 좋아요 SELECT 정책: 수신자도 본인에게 온 likes를 읽을 수 있어야 한다
DROP POLICY IF EXISTS "users can read own likes" ON public.likes;
CREATE POLICY "users can read sent or received likes"
  ON public.likes FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- 수신자가 본인 likes의 read_at / status를 UPDATE할 수 있어야 한다
CREATE POLICY "receivers can update own incoming likes"
  ON public.likes FOR UPDATE
  USING (to_user_id = auth.uid())
  WITH CHECK (to_user_id = auth.uid());
```

| 컬럼 | 용도 |
|------|------|
| `status` | 좋아요 lifecycle (`pending` → `accepted` / `rejected` / `expired`) |
| `expires_at` | 7일 자동 만료 (정책 §4.4) |
| `attached_log_id` | LK11에서 첨부한 본인 로그 id (선택) |
| `read_at` | 받은 좋아요 화면 진입 시 1회 갱신 (미열람 배지 산출) |
| `responded_at` | 수락/거절 시각 |

### 만료 자동 처리

> **선택 방안**: pg_cron 배치 vs 조회 시점 lazy expire. 본 MVP는 **조회 시점 lazy expire**로 시작.

```sql
-- 별도 RPC: 받은 좋아요 화면 진입 시 호출 (선택)
CREATE OR REPLACE FUNCTION public.expire_overdue_likes(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.likes
    SET status = 'expired'
    WHERE (from_user_id = p_user_id OR to_user_id = p_user_id)
      AND status = 'pending'
      AND expires_at <= now()
    RETURNING id
  )
  SELECT COUNT(*)::int FROM updated;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_likes(uuid) TO authenticated;
```

> 마이그레이션 적용 후 `pnpm db:gen-types`. `likes.status` 타입이 union으로 잡혀야 함.

---

## 🗂️ 라우팅

기존 `app/(app)/matches.tsx`를 `likes.tsx`로 리네임하거나 새 라우트 `app/(app)/likes.tsx`로 추가. 탭바 라벨도 "좋아요"로 통일.

```
/(app)/likes              → LK1
/(app)/likes?tab=sent     → LK1 (보낸 탭 활성)  ※ TASK_09C
```

---

## LK1 · 좋아요 탭 (세그먼트)

```
┌──────────────────────────────┐
│  좋아요                       │  ← 헤더
├──────────────────────────────┤
│  ┌──────────┬──────────┐     │
│  │ 받은 (3) │ 보낸      │     │  ← 세그먼트 (받은 미열람 카운트 배지)
│  └──────────┴──────────┘     │
├──────────────────────────────┤
│  [LK3 받은 목록 or LK4 빈 상태] │
├──────────────────────────────┤
│  ⌂   ♡   ✉   ▶              │  ← 탭바
└──────────────────────────────┘
```

```tsx
// app/(app)/likes.tsx
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReceivedLikesList } from '@/components/likes/ReceivedLikesList';
import { SentLikesList }     from '@/components/likes/SentLikesList';   // TASK_09C
import { useLikesUnreadCount } from '@/hooks/useLikesUnreadCount';

export default function LikesScreen() {
  const params = useLocalSearchParams<{ tab?: 'received' | 'sent' }>();
  const [tab, setTab] = useState<'received' | 'sent'>(params.tab ?? 'received');
  const unread = useLikesUnreadCount();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="text-foreground text-2xl font-semibold">좋아요</Text>
      </View>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1">
        <TabsList className="mx-4">
          <TabsTrigger value="received" testID="likes-tab-received">
            <Text>받은</Text>
            {unread > 0 && (
              <View className="ml-1.5 bg-primary rounded-full px-1.5 min-w-[18px] h-[18px] items-center justify-center">
                <Text className="text-primary-foreground text-[10px] font-bold">
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" testID="likes-tab-sent">
            <Text>보낸</Text>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="flex-1">
          <ReceivedLikesList />
        </TabsContent>
        <TabsContent value="sent" className="flex-1">
          <SentLikesList />   {/* TASK_09C */}
        </TabsContent>
      </Tabs>
    </SafeAreaView>
  );
}
```

> **`Tabs` 컴포넌트가 `components/ui/`에 없으면 추가**:
> ```bash
> cd apps/mobile && npx @react-native-reusables/cli add tabs
> ```

---

## 🔢 미열람 카운트 — useLikesUnreadCount

```typescript
// hooks/useLikesUnreadCount.ts

export function useLikesUnreadCount() {
  const { userId } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function fetch() {
      const { count: c } = await supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .is('read_at', null)
        .gt('expires_at', new Date().toISOString());
      if (alive) setCount(c ?? 0);
    }

    fetch();
    // 좋아요 INSERT 알림 시 갱신
    const ch = supabase
      .channel('likes-unread')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'likes', filter: `to_user_id=eq.${userId}` },
        () => fetch(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return count;
}
```

---

## LK2 · 좋아요 목록 조회

> **공통 hook**: 받은/보낸을 한 훅에서 처리. 호출 시 모드 인자.

```typescript
// hooks/useLikesList.ts
import type { Database } from '@dei/api';

type LikeRow = Database['public']['Tables']['likes']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

export type LikeListItem = LikeRow & {
  counterpart: Pick<UserRow, 'id' | 'nickname' | 'age' | 'region'>;
};

interface UseLikesListArgs {
  mode: 'received' | 'sent';
}

export function useLikesList({ mode }: UseLikesListArgs) {
  const { userId } = useAuth();
  const [items, setItems]     = useState<LikeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) lazy expire
      await supabase.rpc('expire_overdue_likes', { p_user_id: userId });

      // 2) 목록 조회
      const counterpartField = mode === 'received' ? 'from_user_id' : 'to_user_id';
      const selfField        = mode === 'received' ? 'to_user_id'   : 'from_user_id';

      const { data, error } = await supabase
        .from('likes')
        .select(`
          *,
          counterpart:users!likes_${counterpartField}_fkey (id, nickname, age, region)
        `)
        .eq(selfField, userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('liked_at', { ascending: false });

      if (error) throw error;
      // 차단 관계 필터링 (차단 테이블 도입 후 보강)
      setItems((data ?? []) as LikeListItem[]);

      // 3) 받은 목록은 화면 진입 시 read_at 갱신 (미열람 → 열람 처리)
      if (mode === 'received') {
        await supabase
          .from('likes')
          .update({ read_at: new Date().toISOString() })
          .eq('to_user_id', userId)
          .eq('status', 'pending')
          .is('read_at', null);
      }
    } catch (e) {
      logger.captureException(e, {
        tags: { feature: 'likes-list', mode },
      });
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, error, refresh };
}
```

> **FK 별칭**: select 안의 `users!likes_${counterpartField}_fkey` 는 Supabase가 자동 생성하는 FK 제약 이름에 맞춰야 한다. 마이그레이션 적용 후 실제 이름은:
> - `likes_from_user_id_fkey`
> - `likes_to_user_id_fkey`
>
> 타입 생성 후 `database.types.ts`에서 확인.

### 조회 조건 명세 (PDF Preview (7) 매핑)

| 조건 | 받은 (`mode='received'`) | 보낸 (`mode='sent'`) |
|------|---------------------------|----------------------|
| 본인 필터 | `to_user_id = me` | `from_user_id = me` |
| 상태 | `status = 'pending'` | `status = 'pending'` |
| 만료 제외 | `expires_at > now()` | `expires_at > now()` |
| 매칭 완료 제외 | `status != 'accepted'` (위 조건으로 자동) | 동일 |
| 차단 제외 | (차단 테이블 도입 후 LEFT JOIN 조건) | 동일 |
| 정렬 | `liked_at DESC` | `liked_at DESC` |
| 읽음 처리 | 진입 시 `read_at = now()` UPDATE | — |

---

## LK3 · 받은 좋아요 목록

```
┌──────────────────────────────┐
│  ┌──────────┬──────────┐     │
│  │ 받은 (0) │ 보낸      │     │
│  └──────────┴──────────┘     │
├──────────────────────────────┤
│  ◯  지수 · 25                │
│     서울 · 2시간 전 · NEW    │
├──────────────────────────────┤
│  ◯  민지 · 28                │
│     부산 · 어제 · 만료 임박   │
└──────────────────────────────┘
```

```tsx
// components/likes/ReceivedLikesList.tsx

export function ReceivedLikesList() {
  const { items, loading, refresh } = useLikesList({ mode: 'received' });
  const router = useRouter();

  if (loading) return <LikesListSkeleton />;
  if (items.length === 0) return <ReceivedLikesEmpty />;     // LK4

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      refreshing={loading}
      onRefresh={refresh}
      estimatedItemSize={84}
      ItemSeparatorComponent={() => <View className="h-px bg-border ml-20" />}
      renderItem={({ item }) => (
        <ReceivedLikeItem
          item={item}
          onPress={() => {
            posthog.capture('like_received_item_tapped', {
              like_id: anonymize(item.id),
              hours_since_received: hoursSince(item.liked_at),
            });
            router.push({
              pathname: '/likes/received/[id]',
              params: { id: item.id },
            });
          }}
        />
      )}
    />
  );
}

function ReceivedLikeItem({ item, onPress }: { item: LikeListItem; onPress: () => void }) {
  const isNew    = isWithinHours(item.liked_at, 24);
  const isUrgent = hoursUntil(item.expires_at) < 24;

  return (
    <Pressable onPress={onPress} className="flex-row items-center px-4 py-3 active:bg-muted/40">
      <View className="w-14 h-14 rounded-full bg-muted items-center justify-center overflow-hidden">
        <Text className="text-muted-foreground text-xl">
          {item.counterpart.nickname.charAt(0)}
        </Text>
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-base font-semibold">
            {item.counterpart.nickname} · {item.counterpart.age}
          </Text>
          {isNew && (
            <View className="bg-primary/15 rounded px-1.5 py-0.5">
              <Text className="text-primary text-[10px] font-semibold">NEW</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-1 mt-1">
          <Text className="text-muted-foreground text-xs">
            {item.counterpart.region} · {formatRelativeTime(item.liked_at)}
          </Text>
          {isUrgent && (
            <Text className="text-destructive text-xs ml-1">· 만료 임박</Text>
          )}
        </View>
      </View>

      <Icon name="chevron-right" size={20} color="hsl(var(--muted-foreground))" />
    </Pressable>
  );
}
```

> **영상 미리보기 없음** — PDF Preview (7)이 명시.

---

## LK4 · 받은 좋아요 빈 상태

```tsx
// components/likes/ReceivedLikesEmpty.tsx

export function ReceivedLikesEmpty() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-32 h-32 rounded-full bg-muted items-center justify-center mb-6">
        <Icon name="heart" size={48} color="hsl(var(--muted-foreground))" />
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        아직 받은 좋아요가 없어요
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2">
        데일리 로그를 만들어{'\n'}더 많은 사람을 만나보세요
      </Text>
      <Button
        className="mt-8 px-8"
        onPress={() => {
          posthog.capture('likes_empty_cta_tapped', { source: 'received' });
          router.push('/(app)/record');
        }}
        testID="likes-empty-cta"
      >
        <Text className="text-primary-foreground">로그 촬영하러 가기</Text>
      </Button>
    </View>
  );
}
```

---

## 📊 PostHog 트래킹

### likes_screen_opened `P0`
```typescript
// 화면 진입 시
posthog.capture('likes_screen_opened', {
  default_tab: 'received' | 'sent',
  unread_count: unread,
});
```

### likes_tab_switched `P1`
```typescript
posthog.capture('likes_tab_switched', { to: 'received' | 'sent' });
```

### likes_received_listed `P1`
```typescript
posthog.capture('likes_received_listed', {
  total:       items.length,
  unread_count: items.filter(i => !i.read_at).length,
  urgent_count: items.filter(i => hoursUntil(i.expires_at) < 24).length,
});
```

### like_received_item_tapped `P0`
```typescript
posthog.capture('like_received_item_tapped', {
  like_id: anonymize(item.id),
  hours_since_received: hoursSince(item.liked_at),
});
```

### likes_empty_cta_tapped `P1`
```typescript
posthog.capture('likes_empty_cta_tapped', { source: 'received' | 'sent' });
```

---

## 🔗 화면 전환 플로우

```
탭바 [♡ 좋아요] 탭
       │
       └─ LK1 (세그먼트 탭 노출 + 미열람 배지)
            │
            ├─ "받은" 탭 (기본)
            │     │
            │     ├─ items.length > 0 ──→ LK3 (목록)
            │     │                          │
            │     │                          └─ 항목 탭 ──→ TASK_09B (LK5)
            │     │
            │     └─ items.length === 0 ──→ LK4 (빈 상태)
            │                                    │
            │                                    └─ CTA ──→ TASK_03 (로그 촬영)
            │
            └─ "보낸" 탭 ──→ TASK_09C (LK9)
```

---

## 📁 파일 구조

```
apps/mobile/
  app/(app)/
    likes.tsx                        ← LK1 (matches.tsx 리네임/대체)
    likes/
      received/[id].tsx              ← TASK_09B (LK5)
      sent/[id].tsx                  ← TASK_09C (LK10)
  components/
    likes/
      ReceivedLikesList.tsx          ← LK3
      ReceivedLikesEmpty.tsx         ← LK4
      LikesListSkeleton.tsx
      SentLikesList.tsx              ← TASK_09C 자리 (이 TASK에서 stub)
    ui/
      tabs.tsx                       ← RNR add 후 생성
  hooks/
    useLikesList.ts                  ← LK2
    useLikesUnreadCount.ts           ← LK1 배지 카운트
  lib/
    formatters.ts                    ← formatRelativeTime, hoursSince, hoursUntil
supabase/
  migrations/
    20260514000010_likes_lifecycle.sql
    20260514000011_expire_overdue_likes.sql
```

---

## ⚙️ 구현 시 주의사항

1. **세그먼트 탭은 RNR `tabs`**: `components/ui/tabs.tsx`가 없으면 `npx @react-native-reusables/cli add tabs` 먼저. inline TabBar 자체 구현 금지.
2. **read_at 갱신 타이밍**: LK3 마운트 시점 1회. `useLikesList` 안에서 처리. 항목 탭 시점이 아님.
3. **lazy expire 호출 비용**: `useLikesList` 마운트마다 RPC 호출. 부담된다면 마지막 호출 시각을 in-memory로 기억하고 5분 내 재호출 스킵.
4. **realtime 구독 권한**: `useLikesUnreadCount`의 postgres_changes 구독은 RLS에 따라 본인 to_user_id 필터된 INSERT만 받는다. 본 마이그레이션의 SELECT 정책 확장이 선행되어야 동작.
5. **차단 관계 필터**: 아직 차단 테이블이 없다면 추후 별도 TASK에서 LEFT JOIN 추가. 본 단계는 TODO 주석만 남기고 진행.
6. **`Tabs` value 동기화**: `tab=sent` 쿼리 파라미터로 진입할 수 있어야 한다 (다른 화면에서 "보낸 좋아요로 이동" 분기). `useLocalSearchParams` 초기값으로 처리.
7. **`logger` 적용**: `useLikesList`, `useLikesUnreadCount` 모두 fetch 실패 시 `captureException`. 사용자 흐름이 막히지 않게 catch 후 빈 배열/0으로 fallback.
8. **`status='accepted'` 항목은 매칭으로 이동**: 본 화면 조회 조건이 `pending`만이므로 자동 제외. 별도 처리 불필요.
9. **현재 `matches.tsx` 파일 처리**: 기존 라우트를 `likes.tsx`로 대체하고 `(app)/_layout.tsx`의 탭 정의도 수정. 탭 라벨 "매칭" → "좋아요".

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 마이그레이션 `likes_lifecycle` + `expire_overdue_likes` 적용 + 타입 재생성
- [ ] `Tabs` UI 컴포넌트 추가
- [ ] LK1: 받은/보낸 세그먼트 탭 전환 동작, 받은 탭에 미열람 카운트 배지
- [ ] LK2: 받은/보낸 공통 `useLikesList` — pending + 미만료 + 차단 제외, `liked_at DESC` 정렬
- [ ] LK2: 받은 모드 진입 시 `read_at` 일괄 UPDATE → 미열람 배지 0 갱신
- [ ] LK3: 닉네임·나이·지역·받은 시각, NEW/만료 임박 배지, 영상 미리보기 없음
- [ ] LK4: 빈 상태 일러스트 + 문구 + "로그 촬영하러 가기" CTA → `record` 라우트
- [ ] Realtime: 본인에게 INSERT 발생 시 unread 카운트 자동 갱신
- [ ] PostHog 5종 이벤트 연동
- [ ] Vitest: `useLikesList` — pending 필터, expires_at 필터, read_at 업데이트 호출 검증 (모킹)
- [ ] Integration: 두 유저로 likes INSERT → 수신자 조회 시 1건 / 만료된 likes는 expire RPC 후 사라짐
- [ ] Jest + RNTL: `ReceivedLikesList` 빈 배열 → `LK4` 노출 / 항목 있을 때 → 첫 항목 닉네임 렌더

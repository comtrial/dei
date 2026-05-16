# TASK · 09B 받은 좋아요 상세 + 수락/거절 + 매칭 생성 (LK5~LK8)

> **작업 범위**: 받은 좋아요 항목 탭 → 상대 프로필을 "받은 좋아요 모드"로 열고, 수락/거절 처리. 수락 시 매칭 생성 + 매칭 완료 화면.
> **선행 작업**: `TASK_09A_좋아요_탭_받은목록.md` (likes 스키마 확장, LK3 진입점) / 06 상대 프로필 화면 기본 구조
> **후속 작업**: 채팅 플로우 (별도 TASK)
> **담당**: 손승태 · collaborator 최승원 (matches 테이블 + RPC), 변호식 (상대 프로필 모드)
> **우선순위**: P0
> **Supabase 테이블**: `likes`, `matches` (신규), `users`, `logs`
> **기획서 참조**: PDF Preview (7), §4.4

---

## 📐 구현 대상

| ID | 타입 | 화면 / 동작 |
|----|------|------------|
| LK5 | screen | 받은 좋아요 상세 (상대 프로필 — 받은 좋아요 모드) |
| LK6 | db    | 좋아요 거절 / 만료 |
| LK7 | db    | 좋아요 수락 + 매칭 생성 |
| LK8 | screen | 매칭 완료 화면 |

---

## 🗄️ matches 테이블 신규 (마이그레이션 포함)

```sql
-- supabase/migrations/20260514000020_create_matches.sql

CREATE TABLE public.matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 좋아요 출처: from_user_id가 user_a 또는 user_b 둘 다 가능하므로 정규화
  source_like_id uuid REFERENCES public.likes(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- (a, b) 순서 정규화: user_a_id < user_b_id 강제 → UNIQUE로 중복 매칭 방지
  CONSTRAINT matches_order_chk CHECK (user_a_id < user_b_id),
  CONSTRAINT matches_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX matches_user_a_idx ON public.matches (user_a_id, created_at DESC);
CREATE INDEX matches_user_b_idx ON public.matches (user_b_id, created_at DESC);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own matches"
  ON public.matches FOR SELECT
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());
-- INSERT는 RPC(SECURITY DEFINER)로만 허용 → INSERT 정책 없음
```

> **순서 정규화 정책**: `user_a_id < user_b_id` 제약으로 같은 두 유저 간 중복 매칭을 UNIQUE로 막는다. RPC에서 두 id를 정렬해 INSERT.

### accept_like RPC (수락 + 매칭 + 좋아요 정리)

```sql
-- supabase/migrations/20260514000021_accept_like_rpc.sql

CREATE OR REPLACE FUNCTION public.accept_like(p_like_id uuid)
RETURNS TABLE (match_id uuid, counterpart_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_like        public.likes;
  v_user_a      uuid;
  v_user_b      uuid;
  v_match_id    uuid;
  v_counterpart uuid;
BEGIN
  -- 1) like 행 잠금 + 권한 체크 (수신자만 수락 가능)
  SELECT * INTO v_like
  FROM public.likes
  WHERE id = p_like_id
  FOR UPDATE;

  IF v_like.id IS NULL THEN
    RAISE EXCEPTION 'like_not_found';
  END IF;
  IF v_like.to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_like.status <> 'pending' THEN
    RAISE EXCEPTION 'like_not_pending: %', v_like.status;
  END IF;
  IF v_like.expires_at <= now() THEN
    RAISE EXCEPTION 'like_expired';
  END IF;

  -- 2) likes accepted 처리
  UPDATE public.likes
  SET status = 'accepted', responded_at = now()
  WHERE id = p_like_id;

  -- 3) 양방향 모든 pending likes 정리 (목록에서 제거되도록)
  --    수락된 매칭에 포함된 두 유저 간 다른 pending likes도 cleanup
  UPDATE public.likes
  SET status = 'accepted', responded_at = now()
  WHERE status = 'pending'
    AND (
      (from_user_id = v_like.from_user_id AND to_user_id = v_like.to_user_id)
      OR (from_user_id = v_like.to_user_id   AND to_user_id = v_like.from_user_id)
    );

  -- 4) 순서 정규화 후 matches UPSERT
  v_user_a := LEAST(v_like.from_user_id, v_like.to_user_id);
  v_user_b := GREATEST(v_like.from_user_id, v_like.to_user_id);

  INSERT INTO public.matches (user_a_id, user_b_id, source_like_id)
  VALUES (v_user_a, v_user_b, p_like_id)
  ON CONFLICT (user_a_id, user_b_id) DO UPDATE
    SET source_like_id = EXCLUDED.source_like_id
  RETURNING id INTO v_match_id;

  -- 5) 상대 user_id 산출
  v_counterpart := CASE WHEN v_user_a = auth.uid() THEN v_user_b ELSE v_user_a END;

  RETURN QUERY SELECT v_match_id, v_counterpart;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_like(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_like(uuid) TO authenticated;
```

### reject_like RPC

```sql
-- supabase/migrations/20260514000022_reject_like_rpc.sql

CREATE OR REPLACE FUNCTION public.reject_like(p_like_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.likes
  SET status = 'rejected', responded_at = now()
  WHERE id = p_like_id
    AND to_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'like_not_rejectable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_like(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_like(uuid) TO authenticated;
```

> 마이그레이션 적용 후 `pnpm db:gen-types`.

---

## 🗂️ 라우팅

```
/(app)/likes/received/[id]   → LK5 (id = likes.id)
/(app)/matched/[matchId]     → LK8 (매칭 완료 화면, 모달처럼 노출)
```

> LK5에서 likes.id를 받아 from_user_id를 조회해 06 상대 프로필 화면으로 전환할 수도 있으나, "받은 좋아요 모드" 상태와 수락/거절 CTA를 위해 likes.id 기준 별도 라우트가 깔끔.

---

## LK5 · 받은 좋아요 상세

```
┌──────────────────────────────┐
│  ←   상대 프로필              │  ← 헤더
├──────────────────────────────┤
│                              │
│        [상대 영상 영역]       │  ← 06 상대 프로필 컴포넌트 재사용
│                              │
│        지수 · 25              │
│        서울                   │
│                              │
│    [날짜별 로그 카드들]       │
│                              │
├──────────────────────────────┤
│  ┌───────────┬────────────┐  │
│  │  거절      │  수락 ♥    │  │  ← 하단 CTA
│  └───────────┴────────────┘  │
└──────────────────────────────┘
```

```tsx
// app/(app)/likes/received/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProfileViewer } from '@/components/profile/ProfileViewer';  // 06 화면 컴포넌트
import { ReceivedLikeFooter } from '@/components/likes/ReceivedLikeFooter';
import { useReceivedLikeDetail } from '@/hooks/useReceivedLikeDetail';

export default function ReceivedLikeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { like, profile, loading, error } = useReceivedLikeDetail(id);

  if (loading) return <ProfileSkeleton />;
  if (error || !like || !profile) return <ErrorScreen onRetry={() => router.replace(`/likes/received/${id}`)} />;

  return (
    <View className="flex-1 bg-background">
      <ProfileViewer
        userId={like.from_user_id}
        profile={profile}
        mode="received-like"           // 06 화면이 모드별 노출 정책 분기
        attachedLogId={like.attached_log_id ?? undefined}
      />
      <ReceivedLikeFooter
        likeId={like.id}
        onResolved={(result) => {
          if (result.kind === 'accepted') {
            router.replace({ pathname: '/matched/[matchId]', params: { matchId: result.matchId } });
          } else {
            router.back();
          }
        }}
      />
    </View>
  );
}
```

### useReceivedLikeDetail

```typescript
// hooks/useReceivedLikeDetail.ts

export function useReceivedLikeDetail(likeId: string) {
  const [state, setState] = useState<{
    like: LikeListItem | null;
    profile: ProfileBundle | null;
    loading: boolean;
    error: Error | null;
  }>({ like: null, profile: null, loading: true, error: null });

  useEffect(() => {
    let alive = true;
    logger.withErrorCapture('like-detail.fetch', async () => {
      const { data: like, error: e1 } = await supabase
        .from('likes')
        .select('*, counterpart:users!likes_from_user_id_fkey(*)')
        .eq('id', likeId)
        .single();
      if (e1) throw e1;

      // 06 상대 프로필 데이터: 데일리 로그 그룹, 검수된 logs 등
      const profile = await fetchProfileBundle(like.from_user_id);

      if (alive) setState({ like, profile, loading: false, error: null });
    }, { tags: { feature: 'received-like-detail', likeId } });
    return () => { alive = false; };
  }, [likeId]);

  return state;
}
```

---

## LK5 하단 CTA — ReceivedLikeFooter

```tsx
// components/likes/ReceivedLikeFooter.tsx

interface Props {
  likeId: string;
  onResolved: (result:
    | { kind: 'accepted'; matchId: string; counterpartId: string }
    | { kind: 'rejected' }
  ) => void;
}

export function ReceivedLikeFooter({ likeId, onResolved }: Props) {
  const { accept, reject, pending } = useLikeResolution(likeId);

  async function handleAccept() {
    posthog.capture('like_received_accept_tapped', { like_id: anonymize(likeId) });
    const result = await accept();
    if (result) onResolved({ kind: 'accepted', ...result });
  }

  async function handleReject() {
    posthog.capture('like_received_reject_tapped', { like_id: anonymize(likeId) });
    const ok = await reject();
    if (ok) onResolved({ kind: 'rejected' });
  }

  return (
    <SafeAreaView edges={['bottom']} className="bg-background border-t border-border">
      <View className="flex-row gap-2 px-4 py-3">
        <Button
          variant="outline"
          className="flex-1"
          onPress={handleReject}
          disabled={pending}
          testID="received-like-reject"
        >
          <Text>거절</Text>
        </Button>
        <Button
          className="flex-1"
          onPress={handleAccept}
          disabled={pending}
          testID="received-like-accept"
        >
          <Icon name="heart" size={16} color="white" />
          <Text className="ml-1 text-primary-foreground">수락</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

---

## LK6 · 좋아요 거절 / 만료 — useLikeResolution

```typescript
// hooks/useLikeResolution.ts

export function useLikeResolution(likeId: string) {
  const [pending, setPending] = useState(false);

  async function reject(): Promise<boolean> {
    setPending(true);
    try {
      const { error } = await supabase.rpc('reject_like', { p_like_id: likeId });
      if (error) {
        logger.captureException(error, { tags: { feature: 'like-reject', likeId } });
        showToast('거절 처리에 실패했어요');
        return false;
      }
      posthog.capture('like_rejected', { like_id: anonymize(likeId) });
      return true;
    } finally {
      setPending(false);
    }
  }

  async function accept(): Promise<{ matchId: string; counterpartId: string } | null> {
    setPending(true);
    try {
      const { data, error } = await supabase.rpc('accept_like', { p_like_id: likeId });
      if (error || !data || data.length === 0) {
        if (error) {
          logger.captureException(error, { tags: { feature: 'like-accept', likeId } });
          if (error.message.includes('like_expired')) {
            showToast('만료된 좋아요예요');
          } else {
            showToast('수락 처리에 실패했어요');
          }
        }
        return null;
      }
      const row = data[0];
      posthog.capture('like_accepted_match_created', {
        like_id: anonymize(likeId),
        match_id: anonymize(row.match_id),
      });
      return { matchId: row.match_id, counterpartId: row.counterpart_id };
    } finally {
      setPending(false);
    }
  }

  return { accept, reject, pending };
}
```

### 만료 흐름 (LK6의 일부)

- 사용자가 LK3 목록을 본 사이 만료된 항목 → `useLikesList`에서 `expire_overdue_likes` RPC로 lazy update + 목록에서 자동 제외 (TASK_09A 참조).
- LK5 진입 후 수락/거절 직전 만료 → `accept_like` RPC에서 `like_expired` 에러 → 토스트 후 LK3 복귀.

### 발송자 알림 정책 (PDF Preview (7))

> "거절은 발송자에게 별도 알림 없음" — 즉 reject_like 후 push/notification INSERT 하지 않는다. 발송자 입장에선 LK10 (보낸 좋아요 상세) 진입 시 목록에서 사라진 것만 확인 가능.

---

## LK7 · 좋아요 수락 + 매칭 생성

LK7은 별도 화면 없이 `accept_like` RPC 호출 자체. 위 `useLikeResolution.accept()`가 RPC를 호출하고, 성공 시 LK8로 라우팅한다.

### 사후 효과

| 대상 | 변경 |
|------|------|
| `likes.status` | `pending → accepted` (이 like 및 양방향 다른 pending도) |
| `likes.responded_at` | `now()` |
| `matches` | 신규 row (또는 ON CONFLICT 시 source_like_id 갱신) |
| 받은/보낸 좋아요 목록 | accepted는 LK1 조회 조건에서 제외 → 자동으로 사라짐 |
| 양방향 프로필 공개 | 매칭 row 존재 = 풀 프로필 공개 (06 상대 프로필 모드 분기) |

> **§4.4 "양방향 전체 프로필 공개"**: 06 상대 프로필 컴포넌트가 matches 테이블에 해당 row가 있는지 확인하고 노출 범위를 분기하도록 추후 보강 (별도 TASK 또는 06 화면에서).

---

## LK8 · 매칭 완료 화면

```
┌──────────────────────────────┐
│                              │
│          🎉                  │
│                              │
│   서로 좋아요를 보냈어요      │
│                              │
│   ◯  지수 · 25                │
│      서울                    │
│                              │
│   ────────────────────       │
│                              │
│  ┌────────────────────────┐  │
│  │     채팅하기            │  │  ← Primary
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │     닫기                │  │  ← Ghost
│  └────────────────────────┘  │
└──────────────────────────────┘
```

```tsx
// app/(app)/matched/[matchId].tsx

export default function MatchedRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const { match, counterpart, loading } = useMatchDetail(matchId);

  useEffect(() => {
    if (match) {
      posthog.capture('match_screen_shown', { match_id: anonymize(matchId) });
    }
  }, [match]);

  if (loading || !counterpart) return <LoadingSpinner />;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <Text className="text-6xl">🎉</Text>
        <Text className="text-foreground text-xl font-semibold text-center">
          서로 좋아요를 보냈어요
        </Text>

        <View className="items-center gap-2 mt-4">
          <View className="w-24 h-24 rounded-full bg-muted items-center justify-center">
            <Text className="text-muted-foreground text-3xl">
              {counterpart.nickname.charAt(0)}
            </Text>
          </View>
          <Text className="text-foreground text-lg font-semibold">
            {counterpart.nickname} · {counterpart.age}
          </Text>
          <Text className="text-muted-foreground text-sm">{counterpart.region}</Text>
        </View>
      </View>

      <View className="px-6 pb-8 gap-2">
        <Button
          size="lg"
          onPress={() => {
            posthog.capture('match_chat_cta_tapped', { match_id: anonymize(matchId) });
            router.replace({ pathname: '/messages/[matchId]', params: { matchId } });
          }}
          testID="match-chat-cta"
        >
          <Text className="text-primary-foreground">채팅하기</Text>
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onPress={() => {
            posthog.capture('match_close_tapped', { match_id: anonymize(matchId) });
            router.replace('/(app)/likes');
          }}
          testID="match-close"
        >
          <Text>닫기</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

### useMatchDetail

```typescript
export function useMatchDetail(matchId: string) {
  const { userId } = useAuth();
  const [state, setState] = useState<{
    match: MatchRow | null;
    counterpart: UserRow | null;
    loading: boolean;
  }>({ match: null, counterpart: null, loading: true });

  useEffect(() => {
    let alive = true;
    logger.withErrorCapture('match-detail.fetch', async () => {
      const { data: match, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error || !match) throw error ?? new Error('match_not_found');

      const counterpartId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
      const { data: cp } = await supabase
        .from('users')
        .select('id, nickname, age, region')
        .eq('id', counterpartId)
        .single();

      if (alive) setState({ match, counterpart: cp, loading: false });
    }, { tags: { feature: 'match-detail', matchId } });
    return () => { alive = false; };
  }, [matchId, userId]);

  return state;
}
```

> `/messages/[matchId]`는 채팅 플로우 TASK에서 구현. 라우트 자체가 미구현이면 임시로 토스트 → LK1 복귀 처리.

---

## 📊 PostHog 트래킹

### like_received_detail_opened `P0`
```typescript
posthog.capture('like_received_detail_opened', {
  like_id: anonymize(like.id),
  hours_since_received: hoursSince(like.liked_at),
  has_attached_log: !!like.attached_log_id,
});
```

### like_received_accept_tapped / like_received_reject_tapped `P0`
```typescript
posthog.capture('like_received_accept_tapped', { like_id: anonymize(likeId) });
posthog.capture('like_received_reject_tapped', { like_id: anonymize(likeId) });
```

### like_accepted_match_created `P0`
```typescript
posthog.capture('like_accepted_match_created', {
  like_id:  anonymize(likeId),
  match_id: anonymize(matchId),
});
```

### like_rejected `P0`
```typescript
posthog.capture('like_rejected', { like_id: anonymize(likeId) });
```

### like_resolve_failed `P0`
```typescript
posthog.capture('like_resolve_failed', {
  action: 'accept' | 'reject',
  reason: 'expired' | 'not_pending' | 'unknown',
});
```

### match_screen_shown / match_chat_cta_tapped / match_close_tapped `P0`
```typescript
posthog.capture('match_screen_shown',    { match_id: anonymize(matchId) });
posthog.capture('match_chat_cta_tapped', { match_id: anonymize(matchId) });
posthog.capture('match_close_tapped',    { match_id: anonymize(matchId) });
```

---

## 🔗 화면 전환 플로우

```
LK3 받은 좋아요 목록
       │
       └─ 항목 탭 ──→ LK5 (받은 좋아요 상세, 06 ProfileViewer 재사용)
                          │
                          ├─ [거절] ──→ LK6 (reject_like RPC) ──→ 토스트 + LK3 복귀
                          │
                          └─ [수락] ──→ LK7 (accept_like RPC)
                                            │
                                            ├─ 성공 ──→ LK8 (매칭 완료) ──→ 채팅하기 / 닫기
                                            └─ 실패(expired/no-pending) ──→ 토스트 + LK3 복귀
```

---

## 📁 파일 구조

```
apps/mobile/
  app/(app)/
    likes/received/[id].tsx        ← LK5 라우트
    matched/[matchId].tsx          ← LK8 라우트
  components/
    likes/
      ReceivedLikeFooter.tsx       ← LK5 하단 수락/거절 CTA
    profile/
      ProfileViewer.tsx            ← (06 화면) mode prop 지원: 'received-like' | 'sent-like' | 'matched' | 'curation'
  hooks/
    useReceivedLikeDetail.ts       ← LK5 데이터
    useLikeResolution.ts           ← LK6 + LK7 RPC 호출
    useMatchDetail.ts              ← LK8 데이터
supabase/
  migrations/
    20260514000020_create_matches.sql
    20260514000021_accept_like_rpc.sql
    20260514000022_reject_like_rpc.sql
```

---

## ⚙️ 구현 시 주의사항

1. **순서 정규화 = UNIQUE의 핵심**: `matches`의 `(user_a_id < user_b_id)` 제약 + UNIQUE로 양방향 중복 매칭 차단. RPC에서 LEAST/GREATEST 정렬 후 INSERT.
2. **accept_like 멱등성**: 동일 like를 두 번 수락 시도 → 두 번째는 `like_not_pending` 에러. RPC ON CONFLICT 처리로 matches는 안전. 클라이언트는 에러 메시지로 분기.
3. **양방향 likes cleanup**: A→B 수락 시점에 B→A pending도 함께 `accepted` 처리. 두 사용자의 받은/보낸 목록에서 즉시 사라지게 하기 위해.
4. **`accept_like` RPC 결과 형식**: PostgREST는 `TABLE (...)` 반환을 배열로 매핑. 위 훅에서 `data[0]` 추출에 주의.
5. **만료 동시성**: 사용자가 LK5에서 머무는 사이 만료될 수 있음. RPC가 권위 — `expires_at <= now()` 체크 후 거부.
6. **`ProfileViewer` mode='received-like'**: 06 상대 프로필 화면이 모드별 노출 정책을 분기해야 함. 받은 좋아요 모드에서는 §4.4 매칭 전 노출 범위(요약 정보 + 데일리 로그 1개 등) 적용. 06 화면이 아직 미완이면 stub으로 진행하고 TODO 주석.
7. **LK8 모달 vs 라우트**: `useRouter().replace()`로 라우팅. `replace`를 써야 뒤로가기 시 LK5로 돌아가지 않고 LK1로 빠진다.
8. **채팅 라우트 미구현 시**: `messages/[matchId]` 진입 토스트 fallback. 채팅 TASK 합류 시 정식 라우트로 교체.
9. **logger**: 모든 RPC 호출 실패는 `captureException` + tags. `like_expired` 같이 사용자 에러는 toast로만, `captureMessage('warning')` 정도로 처리.
10. **realtime 매칭 알림**: 발송자(B→A에서 A가 수락한 경우 B)는 받은 좋아요 목록에서 매칭 알림 푸시 또는 별도 in-app 토스트 검토. 본 TASK 범위 밖 (notifications 테이블 도입 TASK에서).

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 마이그레이션 `create_matches` + `accept_like_rpc` + `reject_like_rpc` 적용 + 타입 재생성
- [ ] LK3 항목 탭 → LK5 라우트 정상 진입, ProfileViewer 'received-like' 모드 노출
- [ ] LK5 하단 거절/수락 CTA 노출, 처리 중 disable
- [ ] 거절: `reject_like` RPC 성공 → 토스트 + LK3 복귀 / likes.status = 'rejected'
- [ ] 수락: `accept_like` RPC 성공 → LK8로 `replace` 라우팅 / likes.status = 'accepted' + matches row 생성
- [ ] 양방향 pending likes cleanup 동작 (A→B 수락 시 B→A pending도 accepted)
- [ ] matches UNIQUE 제약 정상 작동 (수동 검증: 같은 두 유저 재수락 시도 → ON CONFLICT)
- [ ] LK8: 상대 프로필 요약 + 채팅하기/닫기 CTA, replace 라우팅으로 뒤로가기 시 LK1
- [ ] 만료된 like 수락 시도 → `like_expired` 에러 → 토스트 + LK3 복귀
- [ ] PostHog 8종 이벤트 연동
- [ ] Vitest: `useLikeResolution` — accept 성공/실패/만료 분기, reject 성공/실패 분기 (mock supabase)
- [ ] Integration: A→B INSERT 후 B가 accept_like 호출 → matches 1건 + 양쪽 likes accepted / B→A 추가 pending이 있던 경우 같이 accepted 처리
- [ ] Integration: 만료된 likes 수락 시도 → 에러 발생 / `matches_unique_pair` 위반 시도 → ON CONFLICT 동작
- [ ] Maestro E2E: 받은 좋아요 항목 탭 → 수락 → 매칭 완료 화면 노출까지

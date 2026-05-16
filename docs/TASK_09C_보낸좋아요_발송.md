# TASK · 09C 보낸 좋아요 목록 + 좋아요 발송 (LK9~LK12)

> **작업 범위**: 보낸 좋아요 목록 / 상세 (응답 대기 모드) + 06 상대 프로필에서 좋아요 발송 모달 + 실제 INSERT.
> **선행 작업**: `TASK_09A_좋아요_탭_받은목록.md` (likes 스키마 확장, LK1 세그먼트 탭), `TASK_05_홈_큐레이션_H2.md` (canLike / hasAnyVideo 정책)
> **담당**: 손승태 · collaborator 최승원 (RPC), 변호식 (06 상대 프로필 모드)
> **우선순위**: P0
> **Supabase 테이블**: `likes`, `users`, `logs`, `daily_logs`
> **기획서 참조**: PDF Preview (7), §4.3, §4.5

---

## 📐 구현 대상

| ID | 타입 | 화면 / 동작 |
|----|------|------------|
| LK9  | screen | 보낸 좋아요 목록 |
| LK10 | screen | 보낸 좋아요 상세 (응답 대기 모드) |
| LK11 | modal  | 로그 선택 후 좋아요 보내기 |
| LK12 | db     | 좋아요 발송 저장 (RPC) |

---

## 🗂️ 좋아요 발송 자격 / 정책 (§4.3 / §4.5)

| 검증 항목 | 규칙 |
|-----------|------|
| 영상 이력 | `logs` 1건 이상 업로드 이력 (전체 기간) — `hasAnyVideo` |
| 오늘 잔여 횟수 | FREE 플랜 하루 1회 — `getRemainingLikesToday` (TASK_05 정의 재사용) |
| 본인 데일리 로그 완성 여부 | **선택**: 미완성도 발송 가능 (LK5의 수락은 미완성도 가능, 발송도 동일 정책) |
| 첨부 로그 | 선택사항 — 본인이 오늘 올린 로그 중 1개 선택 가능 |
| 중복 발송 | 동일 to_user_id에 pending이 이미 있으면 차단 |
| 매칭 완료 후 재발송 | 동일 두 유저 간 `matches`가 이미 있으면 차단 |

> ⚠️ §4.3 마지막 문단 "선택하지 않고도 발송 가능한지 정책 확정 필요" — 본 TASK는 **선택 사항(optional)** 으로 우선 구현. 향후 강제 정책으로 바뀌면 LK11 UI에서 발송 버튼 disable 처리만 추가하면 됨.

---

## 🗄️ send_like RPC (LK12 — 마이그레이션 포함)

원자적 검증 + INSERT + 일일 카운트 갱신을 RPC 1회로 처리.

```sql
-- supabase/migrations/20260514000030_send_like_rpc.sql

CREATE OR REPLACE FUNCTION public.send_like(
  p_to_user_id      uuid,
  p_attached_log_id uuid DEFAULT NULL
)
RETURNS public.likes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from              uuid := auth.uid();
  v_today             date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_today_count       int;
  v_user_a            uuid;
  v_user_b            uuid;
  v_existing_match    uuid;
  v_existing_pending  uuid;
  v_has_any_video     boolean;
  v_new_like          public.likes;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_from = p_to_user_id THEN
    RAISE EXCEPTION 'self_like_forbidden';
  END IF;

  -- 1) 영상 이력 검증
  SELECT EXISTS (SELECT 1 FROM public.logs WHERE user_id = v_from)
  INTO v_has_any_video;
  IF NOT v_has_any_video THEN
    RAISE EXCEPTION 'no_video_history';
  END IF;

  -- 2) 첨부 로그 소유권 검증
  IF p_attached_log_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.logs WHERE id = p_attached_log_id AND user_id = v_from
    ) THEN
      RAISE EXCEPTION 'attached_log_not_owned';
    END IF;
  END IF;

  -- 3) 매칭 중복 차단
  v_user_a := LEAST(v_from, p_to_user_id);
  v_user_b := GREATEST(v_from, p_to_user_id);
  SELECT id INTO v_existing_match
  FROM public.matches
  WHERE user_a_id = v_user_a AND user_b_id = v_user_b;
  IF v_existing_match IS NOT NULL THEN
    RAISE EXCEPTION 'already_matched';
  END IF;

  -- 4) 중복 pending 차단 (동일 방향)
  SELECT id INTO v_existing_pending
  FROM public.likes
  WHERE from_user_id = v_from
    AND to_user_id   = p_to_user_id
    AND status       = 'pending'
    AND expires_at   > now();
  IF v_existing_pending IS NOT NULL THEN
    RAISE EXCEPTION 'already_pending';
  END IF;

  -- 5) 오늘 발송 횟수 검증 (KST 기준) — FREE 1회
  SELECT COUNT(*) INTO v_today_count
  FROM public.likes
  WHERE from_user_id = v_from
    AND (liked_at AT TIME ZONE 'Asia/Seoul')::date = v_today;
  IF v_today_count >= 1 THEN
    RAISE EXCEPTION 'daily_quota_exceeded';
  END IF;

  -- 6) INSERT
  INSERT INTO public.likes (
    from_user_id, to_user_id, liked_at, status, expires_at, attached_log_id
  )
  VALUES (
    v_from, p_to_user_id, now(),
    'pending', now() + interval '7 days', p_attached_log_id
  )
  RETURNING * INTO v_new_like;

  RETURN v_new_like;
END;
$$;

REVOKE ALL ON FUNCTION public.send_like(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.send_like(uuid, uuid) TO authenticated;
```

> KST 기준 날짜 비교 (`Asia/Seoul`)는 `TASK_05_홈_큐레이션_H2.md`의 정책과 일치시키기 위함. 정책이 UTC 자정이면 변경.

> 적용 후 `pnpm db:gen-types`.

---

## 🗂️ 라우팅

```
/(app)/likes?tab=sent          → LK9 (TASK_09A 화면의 sent 탭)
/(app)/likes/sent/[id]         → LK10
[Modal] SendLikeModal          → LK11 (06 상대 프로필 화면 안에서 노출)
```

---

## LK9 · 보낸 좋아요 목록

`TASK_09A`에서 stub으로 자리만 잡은 `SentLikesList`를 본 TASK에서 실구현.

```tsx
// components/likes/SentLikesList.tsx

export function SentLikesList() {
  const { items, loading, refresh } = useLikesList({ mode: 'sent' });
  const router = useRouter();

  if (loading) return <LikesListSkeleton />;
  if (items.length === 0) return <SentLikesEmpty />;

  return (
    <FlashList
      data={items}
      keyExtractor={(i) => i.id}
      estimatedItemSize={84}
      refreshing={loading}
      onRefresh={refresh}
      ItemSeparatorComponent={() => <View className="h-px bg-border ml-20" />}
      renderItem={({ item }) => (
        <SentLikeItem
          item={item}
          onPress={() => {
            posthog.capture('like_sent_item_tapped', {
              like_id: anonymize(item.id),
              hours_remaining: hoursUntil(item.expires_at),
            });
            router.push({ pathname: '/likes/sent/[id]', params: { id: item.id } });
          }}
        />
      )}
    />
  );
}

function SentLikeItem({ item, onPress }: { item: LikeListItem; onPress: () => void }) {
  const isUrgent = hoursUntil(item.expires_at) < 24;
  return (
    <Pressable onPress={onPress} className="flex-row items-center px-4 py-3 active:bg-muted/40">
      <View className="w-14 h-14 rounded-full bg-muted items-center justify-center">
        <Text className="text-muted-foreground text-xl">
          {item.counterpart.nickname.charAt(0)}
        </Text>
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-foreground text-base font-semibold">
          {item.counterpart.nickname} · {item.counterpart.age}
        </Text>
        <View className="flex-row items-center gap-1 mt-1">
          <Text className="text-muted-foreground text-xs">
            {item.counterpart.region} · {formatRelativeTime(item.liked_at)}
          </Text>
          <View className="bg-muted/60 rounded px-1.5 py-0.5 ml-1">
            <Text className="text-muted-foreground text-[10px]">응답 대기</Text>
          </View>
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

> **회수(취소) 기능 없음** — PDF Preview (7) 명시. 항목 long-press 등으로도 unsend 기능을 절대 추가하지 말 것.

### 보낸 좋아요 빈 상태

```tsx
// components/likes/SentLikesEmpty.tsx

export function SentLikesEmpty() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-32 h-32 rounded-full bg-muted items-center justify-center mb-6">
        <Icon name="send" size={44} color="hsl(var(--muted-foreground))" />
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        아직 보낸 좋아요가 없어요
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2">
        홈 화면에서 마음에 드는 사람에게{'\n'}좋아요를 보내보세요
      </Text>
    </View>
  );
}
```

---

## LK10 · 보낸 좋아요 상세 (응답 대기 모드)

받은 좋아요 상세(LK5)와 화면 구조 동일, **CTA만 다름**.

```
┌──────────────────────────────┐
│  ←   상대 프로필         ⋯    │
├──────────────────────────────┤
│        [상대 영상 영역]       │  ← ProfileViewer mode='sent-like'
│        지수 · 25              │
│        ...                   │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │      응답 대기 중       │  │  ← disabled 라벨
│  └────────────────────────┘  │
└──────────────────────────────┘
```

```tsx
// app/(app)/likes/sent/[id].tsx

export default function SentLikeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { like, profile, loading } = useSentLikeDetail(id);
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  if (loading || !like || !profile) return <ProfileSkeleton />;

  return (
    <View className="flex-1 bg-background">
      <ProfileViewer
        userId={like.to_user_id}
        profile={profile}
        mode="sent-like"
        attachedLogId={like.attached_log_id ?? undefined}
        headerRight={
          <Pressable onPress={() => setMoreOpen(true)} hitSlop={12} testID="sent-like-more">
            <Icon name="more-vertical" size={22} color="hsl(var(--foreground))" />
          </Pressable>
        }
      />

      {/* 응답 대기 CTA 자리 */}
      <SafeAreaView edges={['bottom']} className="bg-background border-t border-border">
        <View className="px-4 py-3">
          <View className="rounded-md py-3 items-center bg-muted">
            <View className="flex-row items-center gap-2">
              <Icon name="clock" size={16} color="hsl(var(--muted-foreground))" />
              <Text className="text-muted-foreground">응답 대기 중</Text>
              <Text className="text-muted-foreground text-xs">
                · {hoursUntil(like.expires_at)}시간 남음
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <MoreActionsSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onReport={() => router.push({ pathname: '/profile/[id]', params: { id: like.to_user_id, action: 'report' } })}
        onBlock={()  => router.push({ pathname: '/profile/[id]', params: { id: like.to_user_id, action: 'block' } })}
      />
    </View>
  );
}
```

### useSentLikeDetail

`useReceivedLikeDetail`과 동일 패턴, FK만 `likes_to_user_id_fkey` 사용.

---

## LK11 · 로그 선택 후 좋아요 보내기 (모달)

진입점: **06 상대 프로필 화면 (큐레이션/검색 진입 모드)** 의 좋아요 보내기 버튼. 홈 큐레이션 카드의 직접 좋아요(`TASK_05`)와는 별개 — 큐레이션 카드의 ♥ 버튼은 기본 발송(첨부 없음)이고, 상대 프로필 화면에서는 LK11 모달 노출 후 선택 발송.

```
┌──────────────────────────────┐
│  좋아요를 보내요         ✕    │
├──────────────────────────────┤
│  오늘 올린 로그 중 하나를     │
│  선택해 함께 보낼 수 있어요.  │
│                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ │  ← 가로 스크롤 (오늘 로그 썸네일)
│  │ 09시 │ │ 14시 │ │ 19시 │ │
│  └──────┘ └──────┘ └──────┘ │
│  [선택 안 함 · 기본]          │
│                              │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │      좋아요 보내기      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

```tsx
// components/likes/SendLikeModal.tsx

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: string;
  onSent: (like: LikeRow) => void;
}

export function SendLikeModal({ open, onOpenChange, toUserId, onSent }: Props) {
  const { userId } = useAuth();
  const todayLogs = useTodayLogs(userId);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const { send, pending } = useSendLike();

  async function handleSend() {
    posthog.capture('send_like_modal_submit', {
      to_user_id: anonymize(toUserId),
      attached_log_id: selectedLogId ? anonymize(selectedLogId) : null,
      has_attachment: !!selectedLogId,
    });
    const result = await send({ toUserId, attachedLogId: selectedLogId });
    if (result.kind === 'ok') {
      showToast('좋아요를 보냈어요 ♥');
      onSent(result.like);
      onOpenChange(false);
    } else {
      handleSendError(result.reason);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>좋아요를 보내요</DialogTitle>
          <DialogDescription>
            오늘 올린 로그 중 하나를 선택해 함께 보낼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {todayLogs.loading ? (
          <View className="h-24 items-center justify-center">
            <Text className="text-muted-foreground text-sm">불러오는 중…</Text>
          </View>
        ) : todayLogs.items.length === 0 ? (
          <View className="h-24 items-center justify-center">
            <Text className="text-muted-foreground text-sm">오늘 올린 로그가 없어요</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            {todayLogs.items.map(log => (
              <Pressable
                key={log.id}
                onPress={() => setSelectedLogId(prev => prev === log.id ? null : log.id)}
                className={cn(
                  'w-20 h-28 rounded-lg overflow-hidden border-2',
                  selectedLogId === log.id ? 'border-primary' : 'border-transparent',
                )}
              >
                <VideoThumb videoUrl={log.video_url} />
                <View className="absolute bottom-1 left-1 bg-black/60 rounded px-1">
                  <Text className="text-white text-[10px]">{log.hour_slot}시</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={() => setSelectedLogId(null)}
          className={cn(
            'rounded-md py-2 px-3 items-center',
            selectedLogId === null ? 'bg-muted' : 'bg-transparent',
          )}
        >
          <Text className={cn('text-sm', selectedLogId === null ? 'text-foreground' : 'text-muted-foreground')}>
            선택 안 함
          </Text>
        </Pressable>

        <DialogFooter>
          <Button onPress={handleSend} disabled={pending} testID="send-like-submit">
            <Text className="text-primary-foreground">
              {pending ? '보내는 중…' : '좋아요 보내기'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function handleSendError(reason: SendLikeError) {
  switch (reason) {
    case 'no_video_history':    return showToast('영상을 먼저 1개 이상 올려주세요');
    case 'daily_quota_exceeded':return showToast('오늘 사용할 수 있는 좋아요를 다 썼어요');
    case 'already_pending':     return showToast('이미 좋아요를 보냈어요');
    case 'already_matched':     return showToast('이미 매칭된 사이예요');
    case 'attached_log_not_owned': return showToast('첨부할 수 없는 로그예요');
    default:                    return showToast('전송에 실패했어요. 잠시 후 다시 시도해주세요');
  }
}
```

### useTodayLogs

```typescript
// hooks/useTodayLogs.ts

export function useTodayLogs(userId: string) {
  const [state, setState] = useState<{ items: LogRow[]; loading: boolean }>({ items: [], loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = getTodayKST();   // YYYY-MM-DD
      const { data } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', userId)
        .gte('recorded_at', `${today}T00:00:00+09:00`)
        .lt('recorded_at',  `${today}T24:00:00+09:00`)
        .order('hour_slot', { ascending: true });
      if (alive) setState({ items: data ?? [], loading: false });
    })();
    return () => { alive = false; };
  }, [userId]);

  return state;
}
```

---

## LK12 · 좋아요 발송 저장 — useSendLike

```typescript
// hooks/useSendLike.ts

export type SendLikeError =
  | 'no_video_history'
  | 'daily_quota_exceeded'
  | 'already_pending'
  | 'already_matched'
  | 'attached_log_not_owned'
  | 'self_like_forbidden'
  | 'unknown';

type SendResult =
  | { kind: 'ok'; like: LikeRow }
  | { kind: 'error'; reason: SendLikeError };

export function useSendLike() {
  const [pending, setPending] = useState(false);

  async function send({ toUserId, attachedLogId }: { toUserId: string; attachedLogId: string | null }): Promise<SendResult> {
    setPending(true);
    try {
      const { data, error } = await supabase.rpc('send_like', {
        p_to_user_id: toUserId,
        p_attached_log_id: attachedLogId,
      });

      if (error) {
        const reason = parseReason(error.message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'send-like', toUserId } });
        }
        return { kind: 'error', reason };
      }

      posthog.capture('like_sent', {
        to_user_id: anonymize(toUserId),
        attached_log_id: attachedLogId ? anonymize(attachedLogId) : null,
        has_attachment: !!attachedLogId,
      });

      return { kind: 'ok', like: data as LikeRow };
    } finally {
      setPending(false);
    }
  }

  return { send, pending };
}

function parseReason(message: string): SendLikeError {
  // Postgres RAISE 메시지에서 키워드 추출
  if (message.includes('no_video_history'))        return 'no_video_history';
  if (message.includes('daily_quota_exceeded'))    return 'daily_quota_exceeded';
  if (message.includes('already_pending'))         return 'already_pending';
  if (message.includes('already_matched'))         return 'already_matched';
  if (message.includes('attached_log_not_owned'))  return 'attached_log_not_owned';
  if (message.includes('self_like_forbidden'))     return 'self_like_forbidden';
  return 'unknown';
}
```

### 큐레이션 카드 ♥ 버튼 호환 (TASK_05 정합)

기존 `TASK_05`의 `handleLike()`는 클라이언트에서 직접 INSERT한다 (`from_user_id`, `to_user_id`, `liked_at`만). 본 RPC 도입 후엔 다음을 권장:

```typescript
// hooks/useLike.ts (TASK_05 갱신)
async function handleLike(targetUserId: string) {
  const { send } = useSendLike();
  const result = await send({ toUserId: targetUserId, attachedLogId: null });
  if (result.kind === 'ok') {
    setRemainingLikes(prev => prev - 1);
    showToast('좋아요를 보냈어요 ♥');
  } else {
    handleSendError(result.reason);
  }
}
```

> 클라이언트 INSERT는 새로운 status/expires_at 컬럼 기본값을 사용하지만, 매칭 중복/이미 발송됨 검증을 못 한다. RPC로 일원화하는 게 안전.

---

## 06 상대 프로필 ↔ LK11 연결

```tsx
// components/profile/ProfileViewer.tsx (06 화면 — 발췌)

function ProfileFooter({ profile, mode }: { profile: ProfileBundle; mode: ProfileMode }) {
  const [sendOpen, setSendOpen] = useState(false);
  const router = useRouter();

  if (mode === 'curation') {
    // 큐레이션 진입: 좋아요 보내기 버튼
    return (
      <>
        <Button
          onPress={() => setSendOpen(true)}
          disabled={!profile.canLike}
          testID="profile-send-like"
        >
          <Icon name="heart" size={16} color="white" />
          <Text className="ml-1 text-primary-foreground">좋아요 보내기</Text>
        </Button>
        <SendLikeModal
          open={sendOpen}
          onOpenChange={setSendOpen}
          toUserId={profile.userId}
          onSent={() => router.replace('/(app)/likes?tab=sent')}
        />
      </>
    );
  }
  // ... 다른 모드는 09B / 09A 참조
}
```

---

## 📊 PostHog 트래킹

### sent_likes_listed `P1`
```typescript
posthog.capture('sent_likes_listed', { total: items.length });
```

### like_sent_item_tapped `P1`
```typescript
posthog.capture('like_sent_item_tapped', {
  like_id: anonymize(item.id),
  hours_remaining: hoursUntil(item.expires_at),
});
```

### send_like_modal_opened `P0`
```typescript
posthog.capture('send_like_modal_opened', {
  to_user_id: anonymize(toUserId),
  today_logs_count: todayLogs.items.length,
});
```

### send_like_modal_submit `P0`
```typescript
posthog.capture('send_like_modal_submit', {
  to_user_id: anonymize(toUserId),
  attached_log_id: attachedLogId ? anonymize(attachedLogId) : null,
  has_attachment: !!attachedLogId,
});
```

### like_sent `P0`
```typescript
posthog.capture('like_sent', {
  to_user_id: anonymize(toUserId),
  attached_log_id: attachedLogId ? anonymize(attachedLogId) : null,
  has_attachment: !!attachedLogId,
});
```

### like_send_failed `P0`
```typescript
posthog.capture('like_send_failed', {
  to_user_id: anonymize(toUserId),
  reason,                  // SendLikeError union
});
```

---

## 🔗 화면 전환 플로우

```
LK1 좋아요 화면 (보낸 탭)
       │
       └─ LK9 보낸 좋아요 목록
              │
              └─ 항목 탭 ──→ LK10 (보낸 좋아요 상세, 응답 대기)
                                │
                                └─ 더보기 ──→ 06 상대 프로필 (신고/차단)

06 상대 프로필 (큐레이션/검색 진입 모드)
       │
       └─ [좋아요 보내기] ──→ LK11 (모달)
                                │
                                ├─ 로그 선택(or 선택 안 함) → [좋아요 보내기]
                                │       │
                                │       └─ LK12 (send_like RPC)
                                │             │
                                │             ├─ 성공 ──→ 토스트 + LK9 (sent 탭으로 이동)
                                │             └─ 실패 ──→ 사유별 토스트
                                │
                                └─ [✕] ──→ 06 상대 프로필 복귀
```

---

## 📁 파일 구조

```
apps/mobile/
  app/(app)/
    likes/sent/[id].tsx                ← LK10 라우트
  components/
    likes/
      SentLikesList.tsx                ← LK9 (TASK_09A의 stub 대체)
      SentLikesEmpty.tsx               ← LK9 빈 상태
      SendLikeModal.tsx                ← LK11
      VideoThumb.tsx                   ← 모달 썸네일 (poster 또는 첫 프레임 캡처)
    profile/
      ProfileViewer.tsx                ← 06 화면 mode='curation' 분기에서 SendLikeModal 호출
  hooks/
    useSentLikeDetail.ts               ← LK10 데이터
    useSendLike.ts                     ← LK12 RPC 호출
    useTodayLogs.ts                    ← LK11 오늘 로그 fetch
supabase/
  migrations/
    20260514000030_send_like_rpc.sql
```

---

## ⚙️ 구현 시 주의사항

1. **RPC 일원화**: 클라이언트 INSERT 경로(TASK_05의 `handleLike`)도 RPC로 교체. 검증을 클라이언트에 분산하면 quota/duplicate 검증을 우회할 수 있다.
2. **첨부 로그 = 오늘 본인 로그만**: `useTodayLogs`가 본인 user_id + KST 오늘 범위로 가져온다. 어제 로그를 첨부하려는 시도는 RPC의 `attached_log_not_owned` 또는 클라 단에서 차단.
3. **KST vs UTC 정합**: `send_like` RPC도 `Asia/Seoul` 기준. 클라이언트 `getTodayKST`도 동일. 한쪽만 UTC면 자정 직후 30분간 불일치 발생.
4. **회수 기능 금지**: PDF Preview (7) 명시. 항목 long-press / swipe-to-delete 등 어떤 형태로도 추가하지 말 것. delete RLS 정책도 본인 likes에 INSERT/SELECT만, DELETE는 의도적으로 차단.
5. **에러 메시지 파싱**: `parseReason`이 keyword include 방식. 향후 i18n 위해 RPC 에러는 RAISE 시 SQLSTATE 코드 분기로 바꾸는 것도 고려.
6. **logger**: `unknown` 사유만 `captureException`. 비즈니스 검증 실패(quota / pending / matched 등)는 user-facing toast로 처리, capture 안 함.
7. **navigation race**: 발송 성공 후 `router.replace('/(app)/likes?tab=sent')`. `push`로 하면 06 프로필 → LK9가 스택에 쌓여 뒤로가기 UX 어색.
8. **LK10 응답 대기 라벨**: 단순 disabled 버튼이 아닌 명확한 "응답 대기 중 · N시간 남음" 표시. 만료가 가까우면 색상 변경 등 향후 보강.
9. **VideoThumb**: `expo-video`로 첫 프레임 캡처가 어려우면 `expo-video-thumbnails`로 별도 처리하거나, logs INSERT 시점에 poster URL을 함께 저장하는 방안 검토 (이는 별도 TASK 범위).

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 마이그레이션 `send_like_rpc` 적용 + 타입 재생성
- [ ] LK9: 보낸 좋아요 목록 노출 (pending + 미만료 + 매칭 완료 제외), "응답 대기" 라벨, 회수 기능 없음
- [ ] LK9 빈 상태 (보낸 좋아요 없을 때)
- [ ] LK10: 보낸 좋아요 상세 — ProfileViewer mode='sent-like' + 응답 대기 라벨 + 더보기 신고/차단
- [ ] LK11: 06 상대 프로필 → 좋아요 보내기 버튼 → 모달 노출
- [ ] LK11: 오늘 로그 가로 스크롤, 토글 선택, "선택 안 함" 옵션
- [ ] LK11: 오늘 로그 0건이면 "오늘 올린 로그가 없어요" 표시 + 첨부 없이도 발송 가능
- [ ] LK12: `send_like` RPC 호출 — 영상 이력/매칭 중복/pending 중복/일일 한도/소유권 검증 동작
- [ ] 발송 성공 시 토스트 + `likes?tab=sent` replace 라우팅
- [ ] 발송 실패 시 사유별 토스트 (`no_video_history`, `daily_quota_exceeded`, `already_pending`, `already_matched`, `attached_log_not_owned`)
- [ ] TASK_05의 큐레이션 카드 ♥ 버튼이 RPC 경로로 교체 (회귀 없음)
- [ ] PostHog 6종 이벤트 연동
- [ ] Vitest: `useSendLike` — 성공/각 에러 reason 분기 (mock supabase + RPC 에러 메시지)
- [ ] Vitest: `useTodayLogs` — KST 자정 경계 케이스 (23:55 / 00:05 모두 정확)
- [ ] Integration: 1) 첫 발송 성공 2) 같은 to에 재발송 → already_pending 3) 다른 to에 추가 발송 → daily_quota_exceeded 4) 영상 이력 없는 유저 발송 → no_video_history 5) 본인↔타인 매칭 후 재발송 → already_matched
- [ ] Maestro E2E: 06 상대 프로필 → 좋아요 보내기 → 모달 → 발송 → LK9 진입까지

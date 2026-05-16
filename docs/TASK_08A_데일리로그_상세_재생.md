# TASK · 08A 데일리 로그 상세 — 풀스크린 순차 재생 (DL1~DL5)

> **작업 범위**: 프로필 날짜별 로그 카드에서 진입하는 풀스크린 영상 순차 재생 화면
> **선행 작업**: `TASK_03_촬영_결과확인.md` (logs INSERT 흐름) 완료 / 프로필 화면의 날짜별 로그 카드 진입점 확정
> **후속 작업**: `TASK_08B_데일리로그_삭제_재계산.md` (DL6~DL8 — 삭제 + 미완성 전환)
> **담당**: 손승태 · collaborator 변호식 (상대 모드 신고/차단 연동)
> **우선순위**: P0
> **Supabase 테이블**: `logs`, `daily_logs`
> **기획서 참조**: PDF Preview (6), §3.2

---

## 📐 구현 대상

| ID | 타입 | 화면 | 진입 조건 |
|----|------|------|----------|
| DL1 | screen | 날짜별 로그 상세 진입 | 프로필의 날짜별 로그 카드 탭 |
| DL2 | screen | 상세 재생 · 본인 모드 | 본인 프로필에서 진입 |
| DL3 | screen | 상세 재생 · 상대 모드 | 상대 프로필에서 진입 |
| DL4 | screen | 순차 재생 엔진 | DL2/DL3 마운트 시 자동 시작 |
| DL5 | screen | 일시정지 상태 | DL4 재생 중 단일 탭 |

---

## 🗂️ 핵심 정책 (§3.2)

> **데일리 로그 완성 = 서로 다른 시각(hour_slot) 로그 3개 이상**
> 3개 미만이어도 날짜별 로그 그룹은 프로필에 남아야 하고, 상세 진입도 가능해야 한다.

| 날짜별 로그 상태 | 진입 가능 | 상단 라벨 |
|------------------|----------|----------|
| 3개 이상 (COMPLETED) | ✅ | "데일리 로그 완성" |
| 1~2개 (INCOMPLETE) | ✅ | "미완성" |
| 0개 | — (프로필에 카드 자체가 없음) | — |

---

## 🗺️ 라우팅 / 진입 파라미터

```
/log-detail?userId={uuid}&date={YYYY-MM-DD}&mode={self|other}&logId={uuid?}
```

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `userId` | ✅ | 로그 주인 user_id |
| `date`   | ✅ | 조회 날짜 (YYYY-MM-DD) |
| `mode`   | ✅ | `self` = 본인(삭제 가능) · `other` = 상대(신고/차단) |
| `logId`  | ❌ | 시작 로그 id (생략 시 그날 첫 로그부터) |

> `mode`는 진입 시 `userId === currentUserId` 비교로도 산출 가능. 명시 파라미터로 받는 이유는 미래에 admin/preview 진입을 추가하기 위함.

---

## 📥 데이터 페칭 — useLogDetail

```typescript
// hooks/useLogDetail.ts

type LogRow = Database['public']['Tables']['logs']['Row'];

interface UseLogDetailParams {
  userId: string;
  date: string;        // YYYY-MM-DD
  startLogId?: string;
}

export function useLogDetail({ userId, date, startLogId }: UseLogDetailParams) {
  const [logs, setLogs]     = useState<LogRow[]>([]);
  const [index, setIndex]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'COMPLETED' | 'INCOMPLETE'>('INCOMPLETE');

  useEffect(() => {
    logger.withErrorCapture('log-detail.fetch', async () => {
      setLoading(true);
      const dayStart = `${date}T00:00:00`;
      const dayEnd   = `${date}T23:59:59.999`;

      // 1) 날짜의 모든 로그 (recorded_at 오름차순)
      const { data: rows, error } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', userId)
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      // 2) 데일리 로그 상태 (다른 hour_slot 3개 이상 여부)
      const hourSet = new Set((rows ?? []).map(r => r.hour_slot));
      setStatus(hourSet.size >= 3 ? 'COMPLETED' : 'INCOMPLETE');

      setLogs(rows ?? []);
      const startIdx = startLogId ? (rows ?? []).findIndex(r => r.id === startLogId) : 0;
      setIndex(startIdx >= 0 ? startIdx : 0);
      setLoading(false);
    }, { tags: { screen: 'log-detail', userId, date } });
  }, [userId, date, startLogId]);

  const current = logs[index];
  const next = useCallback(() => setIndex(i => (i + 1) % Math.max(logs.length, 1)), [logs.length]);
  const prev = useCallback(() => setIndex(i => (i - 1 + logs.length) % Math.max(logs.length, 1)), [logs.length]);
  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(i, logs.length - 1))), [logs.length]);

  return { logs, index, current, status, loading, next, prev, goTo };
}
```

> **상대 모드(`other`)에서의 RLS**: 현재 `logs` 테이블 RLS는 `user_id = auth.uid()`만 SELECT 허용 (`docs/DB_스키마.md`). 상대 로그 열람을 위해 `TASK_08B` 또는 별도 선행 TASK에서 RLS 확장이 필요하다. 잠정 정책:
> ```sql
> -- 상대 로그 열람: 검수 통과된 로그만, 차단 관계 없을 때
> CREATE POLICY "users can read approved logs of others"
>   ON public.logs FOR SELECT
>   USING (검수_YN = 'Y'); -- 차단 테이블 도입 후 추가 조건 필요
> ```

---

## DL1 · 날짜별 로그 상세 진입

`/app/log-detail.tsx`가 `mode` 파라미터를 보고 DL2/DL3로 분기한다.

```tsx
// app/log-detail.tsx
import { useLocalSearchParams, Stack } from 'expo-router';
import { LogDetailSelf }  from '@/components/log-detail/LogDetailSelf';
import { LogDetailOther } from '@/components/log-detail/LogDetailOther';

export default function LogDetailRoute() {
  const { userId, date, mode, logId } = useLocalSearchParams<{
    userId: string; date: string; mode: 'self' | 'other'; logId?: string;
  }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      {mode === 'self'
        ? <LogDetailSelf userId={userId} date={date} startLogId={logId} />
        : <LogDetailOther userId={userId} date={date} startLogId={logId} />}
    </>
  );
}
```

---

## DL2 · 상세 재생 · 본인 모드

```
┌──────────────────────────────┐
│ ← 2026-05-12  •  완성        │  ← 상단: 날짜 + 상태 라벨
│                    ⋯         │  ← 더보기(본인은 미사용)
│                              │
│                              │
│        [영상 풀스크린]        │  ← cover, autoplay
│                              │
│                              │
│  ◀  ●●○○○   ▶               │  ← 진행 도트 + prev/next
│   14:23                      │  ← 현재 로그 시각
│                              │
│       🗑️  삭제                │  ← 본인 모드만 노출
└──────────────────────────────┘
```

```tsx
// components/log-detail/LogDetailSelf.tsx

interface Props { userId: string; date: string; startLogId?: string }

export function LogDetailSelf({ userId, date, startLogId }: Props) {
  const router = useRouter();
  const { logs, index, current, status, loading, next, prev } =
    useLogDetail({ userId, date, startLogId });

  if (loading || !current) return <LogDetailSkeleton />;

  function handleDelete() {
    router.push({
      pathname: '/log-detail/delete-confirm',
      params: { logId: current.id, userId, date },
    });
  }

  return (
    <View className="flex-1 bg-black">
      <SequentialPlayer
        logs={logs}
        index={index}
        onComplete={next}
        onTap="toggle"  // DL4 ↔ DL5
      />

      {/* 상단 헤더 */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="chevron-left" size={28} color="white" />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-base">{formatKoreanDate(date)}</Text>
            <View className={cn(
              'rounded-full px-2 py-0.5',
              status === 'COMPLETED' ? 'bg-primary' : 'bg-muted/60',
            )}>
              <Text className="text-xs text-white">
                {status === 'COMPLETED' ? '완성' : '미완성'}
              </Text>
            </View>
          </View>
          <View className="w-7" />
        </View>
      </SafeAreaView>

      {/* 하단 컨트롤 */}
      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="px-6 pb-6 gap-4">
          <ProgressDots total={logs.length} current={index} />
          <View className="flex-row items-center justify-between">
            <Pressable onPress={prev} hitSlop={12}>
              <Icon name="chevron-left" size={32} color="white" />
            </Pressable>
            <Text className="text-white text-sm">
              {formatTime(current.recorded_at)}
            </Text>
            <Pressable onPress={next} hitSlop={12}>
              <Icon name="chevron-right" size={32} color="white" />
            </Pressable>
          </View>
          <Button
            variant="destructive"
            onPress={handleDelete}
            testID="log-detail-delete-btn"
          >
            <Icon name="trash-2" size={16} color="white" />
            <Text className="ml-2 text-white">삭제</Text>
          </Button>
        </View>
      </SafeAreaView>
    </View>
  );
}
```

---

## DL3 · 상세 재생 · 상대 모드

본인 모드와 거의 동일하되:
- ❌ 삭제 버튼 비노출
- ✅ 상단 더보기(⋯) — 신고/차단 (시트로 노출, 06 상대 프로필 화면으로 cross 이동 가능)
- ✅ 상단 라벨에 닉네임 추가

```tsx
// components/log-detail/LogDetailOther.tsx

export function LogDetailOther({ userId, date, startLogId }: Props) {
  const router = useRouter();
  const { logs, index, current, loading, next, prev } =
    useLogDetail({ userId, date, startLogId });
  const otherUser = useUserProfile(userId);
  const [moreOpen, setMoreOpen] = useState(false);

  if (loading || !current) return <LogDetailSkeleton />;

  return (
    <View className="flex-1 bg-black">
      <SequentialPlayer logs={logs} index={index} onComplete={next} onTap="toggle" />

      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="chevron-left" size={28} color="white" />
          </Pressable>
          <View>
            <Text className="text-white text-sm font-semibold">
              {otherUser?.nickname}
            </Text>
            <Text className="text-white/70 text-xs text-center">
              {formatKoreanDate(date)}
            </Text>
          </View>
          <Pressable onPress={() => setMoreOpen(true)} hitSlop={12} testID="log-detail-more">
            <Icon name="more-vertical" size={24} color="white" />
          </Pressable>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="px-6 pb-8 gap-3">
          <ProgressDots total={logs.length} current={index} />
          <View className="flex-row items-center justify-between">
            <Pressable onPress={prev}><Icon name="chevron-left" size={32} color="white" /></Pressable>
            <Text className="text-white text-sm">{formatTime(current.recorded_at)}</Text>
            <Pressable onPress={next}><Icon name="chevron-right" size={32} color="white" /></Pressable>
          </View>
        </View>
      </SafeAreaView>

      <MoreActionsSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onReport={() => router.push({ pathname: '/profile/[id]', params: { id: userId, action: 'report' } })}
        onBlock={()  => router.push({ pathname: '/profile/[id]', params: { id: userId, action: 'block' } })}
      />
    </View>
  );
}
```

---

## DL4 · 순차 재생 엔진 — SequentialPlayer

> **핵심 동작**: 인덱스의 영상을 재생 → 종료 시 `onComplete` 호출 → 부모가 `next()` 호출 → 다음 인덱스 영상 마운트. 마지막에서 0으로 루프.

```tsx
// components/log-detail/SequentialPlayer.tsx
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

interface Props {
  logs: LogRow[];
  index: number;
  onComplete: () => void;
  onTap?: 'toggle' | 'noop';
}

export function SequentialPlayer({ logs, index, onComplete, onTap = 'toggle' }: Props) {
  const current = logs[index];
  const player = useVideoPlayer(current?.video_url ?? null, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  // 재생 상태 추적 (DL5 일시정지)
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // 영상 종료 → 자동 다음
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (player.status === 'readyToPlay' && player.currentTime > 0
        && Math.abs(player.currentTime - player.duration) < 0.25) {
      onComplete();
    }
  }, [player.currentTime, player.duration, player.status]);

  // 백그라운드 전환 시 정지
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => sub.remove();
  }, [player]);

  // 화면 이탈 시 리소스 해제 (expo-video는 unmount 시 자동, 안전망)
  useEffect(() => () => player.release?.(), [player]);

  // index 변경 시 src 교체 (expo-video는 source 재할당)
  useEffect(() => {
    if (current?.video_url) {
      player.replace(current.video_url);
      player.play();
    }
  }, [current?.video_url]);

  function handleTap() {
    if (onTap === 'noop') return;
    if (isPlaying) player.pause();
    else player.play();
  }

  return (
    <Pressable onPress={handleTap} className="absolute inset-0">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />
      {!isPlaying && (
        <View className="absolute inset-0 items-center justify-center">
          <View className="bg-black/50 rounded-full p-4">
            <Icon name="play" size={40} color="white" />
          </View>
        </View>
      )}
    </Pressable>
  );
}
```

### DL4 동작 요약

| 트리거 | 결과 |
|--------|------|
| 마운트 / index 변경 | 해당 영상 자동 재생 |
| 영상 종료 (`currentTime ≈ duration`) | `onComplete()` → 다음 index |
| 마지막 index 종료 | `(index + 1) % logs.length === 0` → 첫 로그로 루프 |
| 단일 탭 | 재생 ↔ 일시정지 (DL5) |
| AppState 비active | `player.pause()` |
| 화면 unmount | `player.release()` |

---

## DL5 · 일시정지 상태

별도 화면 없음 — DL4의 `isPlaying === false` 상태가 곧 DL5다. UI 차이:

| 요소 | 재생(DL4) | 일시정지(DL5) |
|------|-----------|--------------|
| 현재 프레임 | 자동 진행 | 고정 |
| 진행 도트 | 현재 위치 유지 | 현재 위치 유지 |
| 시각 라벨 | 표시 | 표시 |
| 중앙 오버레이 | 없음 | 반투명 ▶ 아이콘 |

```tsx
{!isPlaying && (
  <View className="absolute inset-0 items-center justify-center pointer-events-none">
    <View className="bg-black/50 rounded-full p-4">
      <Icon name="play" size={40} color="white" />
    </View>
  </View>
)}
```

---

## 진행 도트 — ProgressDots

```tsx
// components/log-detail/ProgressDots.tsx

export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View className="flex-row gap-1 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className={cn(
            'h-1 rounded-full transition-all',
            i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/40',
          )}
        />
      ))}
    </View>
  );
}
```

---

## 📊 PostHog 트래킹

### log_detail_opened `P0`
```typescript
posthog.capture('log_detail_opened', {
  mode,                                  // 'self' | 'other'
  log_count: logs.length,
  daily_status: status,                  // 'COMPLETED' | 'INCOMPLETE'
  target_user_id: anonymize(userId),
  source: 'profile_date_card',
});
```

### log_detail_log_advanced `P1`
```typescript
// 자동/수동 인덱스 이동 시
posthog.capture('log_detail_log_advanced', {
  from_index: prevIdx,
  to_index:   nextIdx,
  trigger:    'auto' | 'next_btn' | 'prev_btn',
});
```

### log_detail_paused `P2`
```typescript
posthog.capture('log_detail_paused', { index, total: logs.length });
```

### log_detail_dismissed `P1`
```typescript
posthog.capture('log_detail_dismissed', {
  index_at_exit: index,
  total: logs.length,
  reason: 'back' | 'background' | 'navigate_away',
});
```

---

## 🔗 화면 전환 플로우

```
프로필 화면 (날짜별 로그 카드 탭)
       │
       ├─ 본인 프로필 ──→ DL1 (mode=self) ──→ DL2 ──→ DL4(재생) ⇄ DL5(일시정지)
       │                                          │
       │                                          ├─ 삭제 버튼 ──→ TASK_08B (DL6)
       │                                          └─ 뒤로가기 ──→ 프로필 화면
       │
       └─ 상대 프로필 ──→ DL1 (mode=other) ──→ DL3 ──→ DL4(재생) ⇄ DL5(일시정지)
                                                  │
                                                  ├─ 더보기 ──→ 06 · 상대 프로필 (신고/차단)
                                                  └─ 뒤로가기 ──→ 프로필 화면
```

---

## 📁 파일 구조

```
apps/mobile/
  app/
    log-detail.tsx                       ← 라우트 (mode 분기)
  components/
    log-detail/
      LogDetailSelf.tsx                  ← DL2
      LogDetailOther.tsx                 ← DL3
      SequentialPlayer.tsx               ← DL4 + DL5
      ProgressDots.tsx
      MoreActionsSheet.tsx               ← 상대 모드 신고/차단 시트
      LogDetailSkeleton.tsx
  hooks/
    useLogDetail.ts                      ← 데이터 페칭 + index 관리
    useUserProfile.ts                    ← (이미 있다면 재사용)
  lib/
    formatters.ts                        ← formatKoreanDate, formatTime
```

---

## ⚙️ 구현 시 주의사항

1. **expo-video 사용**: 프로젝트는 SDK 54. `expo-av`가 아닌 `expo-video`의 `useVideoPlayer` + `VideoView` 사용. `player.replace()`로 src 교체.
2. **`onComplete` 디바운스**: `currentTime ≈ duration` 체크가 60fps에서 여러 번 트리거될 수 있음. ref로 한 번만 발화하도록 가드.
3. **루프 처리는 부모에서**: `useVideoPlayer`의 `loop=true` 대신 `onComplete` 콜백에서 `next()` 호출 → `(index+1) % length`로 자연 루프. 마지막 로그→ 첫 로그 전환 시에도 PostHog 이벤트가 정상 트래킹됨.
4. **백그라운드 정지 필수**: AppState 'active' 외에서는 `player.pause()`. iOS 백그라운드 자동재생 정책 위반 방지.
5. **상대 모드 RLS**: 현재 `logs` 테이블 RLS는 본인 로그만 SELECT 허용. 상대 모드(DL3) 구현 전에 RLS 확장 필요 — `TASK_08B` 또는 별도 선행 마이그레이션에서 처리. 미적용 상태에서 DL3 진입 시 빈 배열 반환.
6. **풀스크린 statusBar**: `expo-router`의 `Stack.Screen options={{ headerShown: false }}`로 헤더 제거 + `StatusBar` 컴포넌트로 `barStyle="light-content"` + `translucent`.
7. **테스트ID**: 핵심 인터랙션 요소(`log-detail-delete-btn`, `log-detail-more`, `log-detail-next/prev`)에 `testID` 부여 — Maestro E2E 대비.
8. **logger 적용**: `useLogDetail` fetch와 `SequentialPlayer`의 영상 로드 실패는 `logger.captureException` 보고. 비동기 경계는 `logger.withErrorCapture`로 감싼다.
9. **NativeWind 우선**: 색상은 디자인 토큰 (`bg-primary`, `text-muted-foreground` 등). 단 풀스크린 영상 오버레이의 반투명 검정은 `bg-black/50` 같은 raw 클래스 사용 가능 (토큰화할 의미 없음).

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 본인 프로필 날짜 카드 → DL1 → DL2 정상 진입, 영상 자동 재생
- [ ] 상대 프로필 날짜 카드 → DL1 → DL3 정상 진입 (RLS 확장 후)
- [ ] DL4 순차 재생: 영상 종료 시 자동으로 다음 로그 재생, 마지막에서 첫 로그로 루프
- [ ] DL5 일시정지: 단일 탭으로 토글, 재생 탭 시 같은 로그 그 자리부터 재개
- [ ] 진행 도트(`●●○○○`)가 현재 인덱스를 반영
- [ ] 상단 라벨: 본인 모드 = "날짜 · 완성/미완성", 상대 모드 = "닉네임 + 날짜"
- [ ] 본인 모드 하단 삭제 버튼 노출 / 상대 모드는 비노출
- [ ] 상대 모드 상단 ⋯ → 신고/차단 시트 (06 상대 프로필로 cross navigation)
- [ ] 백그라운드 전환 시 자동 정지, 화면 이탈 시 플레이어 release
- [ ] PostHog 4종 이벤트(`log_detail_opened`, `log_detail_log_advanced`, `log_detail_paused`, `log_detail_dismissed`) 연동
- [ ] `useLogDetail` 단위 테스트(Vitest): 날짜 범위 필터, 다른 hour_slot 카운트 → status 산출, startLogId 인덱스 매핑
- [ ] `SequentialPlayer` 컴포넌트 테스트(Jest + RNTL): index 변경 시 `player.replace` 호출, 종료 시 `onComplete` 1회만 호출

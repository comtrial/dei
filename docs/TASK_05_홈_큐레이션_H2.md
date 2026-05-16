# TASK · 05 홈 화면 — 큐레이션 3명 카드 (H2 Screen)

> **작업 범위**: 큐레이션 풀 정상 존재 시 홈 화면 — 3명 영상 카드 세로 배치  
> **선행 작업**: `TASK_04_홈_빈상태_H3.md` 완료 후 진행  
> **담당**: 손승태 · collaborator 최승원  
> **우선순위**: P0  
> **Supabase 테이블**: `logs`, `curation_pool`, `likes`  
> **기획서 참조**: §4.2, §4.2.1, §4.2.2, §4.2.3, §4.6, §3.3

---

## 📐 구현 대상

| ID | 상태 | 진입 조건 |
|----|------|----------|
| H2-A | 큐레이션 정상 + B2 배너 노출 | 풀 3명 이상 + 영상 미업로드 (전체 기간) |
| H2-B | 큐레이션 정상 + 좋아요 활성 | 풀 3명 이상 + 영상 1건 이상 업로드 |

---

## 💞 매칭 정책 — 이성만 추천 (Heterosexual default)

> 본인 `profiles.gender` 와 **반대 성별**의 사용자만 큐레이션 풀에 포함됩니다.

| 본인 gender | 추천 대상 gender |
|---|---|
| `M` | `F` 만 |
| `F` | `M` 만 |
| `NULL` / 그 외 | **추천 안 함** (빈 풀 → H3 화면) |

**적용 위치 (양쪽 모두 동일 정책 보장 필수)**:
1. 클라이언트 `apps/mobile/hooks/useHomeScreen.ts` 의 `fetchCurationPool` — 일반 진입 + 무료 새로고침
2. 서버 RPC `consume_refresh_item` (`supabase/migrations/...curation_opposite_gender_filter.sql`) — 유료 리프레시

> 동성 추천 / 선호 성별 사용자 설정 / 양쪽 노출 정책은 현재 범위 밖.
> 변경 시 두 경로 (클라 fetch + RPC) 를 함께 수정해야 정책이 일관됩니다.

---

## 🗂️ 좋아요 자격 기준 (hasAnyVideo)

> 영상을 **전체 기간 통틀어 1건 이상** 업로드한 사용자만 좋아요 가능

```typescript
// hooks/useHomeScreen.ts — hasAnyVideo 판단

// 내 영상 업로드 이력 확인 (전체 기간)
async function checkHasAnyVideo(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('logs')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// 오늘 잔여 좋아요 횟수
// FREE 플랜: 하루 1회
// PAID 플랜: 추후 확장 (daily_like_quota 필드로 관리)
async function getRemainingLikesToday(userId: string): Promise<number> {
  const FREE_DAILY_QUOTA = 1;
  const today = getToday();
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('from_user_id', userId)
    .gte('liked_at', `${today}T00:00:00`);
  const usedToday = data?.length ?? 0;
  return Math.max(0, FREE_DAILY_QUOTA - usedToday);
  // TODO: 유료 플랜 시 FREE_DAILY_QUOTA → user.daily_like_quota 로 교체
}
```

---

## 🗺️ 홈 진입 데이터 페칭 로직

```typescript
// hooks/useHomeScreen.ts

export function useHomeScreen() {
  const { userId } = useAuth();
  const [pool, setPool]                     = useState<CurationUser[]>([]);
  const [hasAnyVideo, setHasAnyVideo]       = useState(false);
  const [remainingLikes, setRemainingLikes] = useState(0);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    // 항상 최신 — 캐시 없음
    const [poolData, anyVideo, remaining] = await Promise.all([
      fetchCurationPool(userId),
      checkHasAnyVideo(userId),
      getRemainingLikesToday(userId),
    ]);

    setPool(poolData);
    setHasAnyVideo(anyVideo);
    setRemainingLikes(remaining);
    setLoading(false);
  }

  // 좋아요 가능 조건: 영상 이력 있음 AND 오늘 잔여 횟수 > 0
  const canLike = hasAnyVideo && remainingLikes > 0;
  const screen  = pool.length >= 3 ? 'H2' : 'H3';

  return { pool, hasAnyVideo, canLike, remainingLikes, setRemainingLikes, screen, loading, refresh: fetchAll };
}

// 큐레이션 풀 fetch
// 조건: 검수_YN=Y, 차단_YN=N, user_id != 본인, profiles.gender = 이성
async function fetchCurationPool(userId: string): Promise<CurationUser[]> {
  const today = getToday();
  // Step 0: 본인 gender → 이성만 후보
  const { data: selfProfile } = await supabase
    .from('profiles').select('gender').eq('user_id', userId).maybeSingle();
  const selfGender = selfProfile?.gender;
  if (selfGender !== 'M' && selfGender !== 'F') return [];
  const targetGender = selfGender === 'M' ? 'F' : 'M';

  const { data: oppositeProfiles } = await supabase
    .from('profiles').select('user_id').eq('gender', targetGender);
  const allowedUserIds = (oppositeProfiles ?? []).map((r) => r.user_id);
  if (allowedUserIds.length === 0) return [];

  const { data } = await supabase
    .from('curation_pool')
    .select('*, users(*), logs(*)')
    .eq('pool_date', today)
    .neq('user_id', userId)
    .eq('검수_YN', 'Y')
    .eq('차단_YN', 'N')
    .in('user_id', allowedUserIds)
    .limit(3);
  return data ?? [];
}
```

---

## H2 · 화면 레이아웃

### 전체 구조

```
┌──────────────────────────────┐
│  dei.                    🔔  │  ← 상단 바 (고정)
├──────────────────────────────┤
│  [B2 배너 — 영상 미업로드 시만] │  ← 조건부 (hasAnyVideo = false)
├──────────────────────────────┤
│                              │
│  ┌────────────────────────┐  │
│  │   카드 1 — 영상 풀스크린 │  │  ← 각 1/3 높이
│  │   닉네임·나이·지역 좌하  │  │
│  │   음소거 토글 우하      │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   카드 2               │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   카드 3               │  │
│  └────────────────────────┘  │
│         [새로운 3명 보기]     │  ← 부유 버튼 (FAB)
│                           ●  │  ← 우측 도트 인디케이터
│                           ·  │
│                           ·  │
├──────────────────────────────┤
│  ⌂홈   ♡좋아요  ✉채팅  ▶촬영│  ← 탭바
└──────────────────────────────┘
```

---

## 카드 컴포넌트 — CurationCard

```tsx
// components/home/CurationCard.tsx

interface Props {
  user: CurationUser;
  position: 1 | 2 | 3;
  canLike: boolean;          // 좋아요 버튼 활성화 조건 (hasAnyVideo && remainingLikes > 0)
  onLike: (userId: string) => void;
  onCardTap: (userId: string) => void;
}

export function CurationCard({ user, position, canLike, onLike, onCardTap }: Props) {
  const [muted, setMuted] = useState(true);   // 음소거 기본

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onCardTap(user.id)}
      activeOpacity={0.95}
    >
      {/* 영상 — 풀스크린 베이스 */}
      <Video
        source={{ uri: user.latestDailyLogUrl }}  // §3.3 최신 데일리 로그
        shouldPlay={true}
        isLooping={true}
        isMuted={muted}
        resizeMode={ResizeMode.COVER}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 좌하단 — 닉네임 / 나이 / 지역 */}
      <View style={styles.infoChip}>
        <Text style={styles.infoName}>{user.nickname} · {user.age}</Text>
        <Text style={styles.infoSub}>{user.region}</Text>
      </View>

      {/* 우하단 — 음소거 토글 */}
      <TouchableOpacity
        style={styles.muteBtn}
        onPress={(e) => { e.stopPropagation(); setMuted(!muted); }}
      >
        <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
      </TouchableOpacity>

      {/* 좋아요 버튼 (canLike = true일 때만 노출) */}
      {canLike && (
        <TouchableOpacity
          style={styles.likeBtn}
          onPress={(e) => { e.stopPropagation(); onLike(user.id); }}
        >
          <Text style={styles.likeIcon}>♥</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, position: 'relative', overflow: 'hidden' },

  infoChip: {
    position: 'absolute', left: 10, bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8,
  },
  infoName: { color: '#fff', fontSize: 12, fontWeight: '600' },
  infoSub:  { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 1 },

  muteBtn: {
    position: 'absolute', right: 10, bottom: 8,
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  muteIcon: { fontSize: 11 },

  likeBtn: {
    position: 'absolute', right: 10, bottom: 38,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#C0432A',
    alignItems: 'center', justifyContent: 'center',
  },
  likeIcon: { fontSize: 13, color: '#fff' },
});
```

---

## B2 배너 — 영상 미업로드 시 노출

> **노출 조건**: `hasAnyVideo === false`
> **숨김 조건**: `hasAnyVideo === true` (영상 1건 이상 업로드)

```tsx
// components/home/B2Banner.tsx (TASK_04와 동일 컴포넌트 재사용)

export function B2Banner() {
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => navigation.navigate('CameraScreen')}
    >
      <Text style={styles.icon}>▶</Text>
      <Text style={styles.text}>
        영상을 찍으면{'\n'}좋아요를 보낼 수 있어요
      </Text>
      <Text style={styles.cta}>촬영 →</Text>
    </TouchableOpacity>
  );
}
```

---

## 좋아요 정책

```typescript
// 좋아요 규칙
// - 영상을 1건 이상 업로드한 경우에만 전송 가능 (전체 기간 기준)
// - 하루 잔여 횟수(remainingLikes) 소진 전까지 전송 가능
//   FREE 플랜: 하루 1회
//   PAID 플랜: 추후 daily_like_quota 필드로 횟수 확장
// - 자격 미충족 또는 잔여 횟수 0: 좋아요 버튼 비노출 (비활성이 아닌 숨김)

async function handleLike(targetUserId: string) {
  if (!canLike) return;   // 방어 코드 (hasAnyVideo && remainingLikes > 0)

  const { error } = await supabase
    .from('likes')
    .insert({
      from_user_id: userId,
      to_user_id:   targetUserId,
      liked_at:     new Date().toISOString(),
    });

  if (!error) {
    setRemainingLikes(prev => prev - 1);
    showToast('좋아요를 보냈어요 ♥');
  }
}
```

### 과금 구조 (추후 확장)

| 플랜 | 하루 좋아요 횟수 | 조건 |
|------|----------------|------|
| FREE | 1회 | 영상 1건 이상 업로드 |
| PAID (추후) | N회 | 구독 또는 일회성 결제 |

> `daily_like_quota` 필드를 사용자 테이블에 추가해 플랜별 한도 관리 예정.
> 현재 FREE 기준(`= 1`)은 하드코딩 상수 `FREE_DAILY_QUOTA`로 분리해 추후 교체 용이하게 유지.

---

## 상대 영상 노출 정책 (§4.6)

```
추천 카드 영상은 항상 상대의 최신 데일리 로그를 노출:
  → 상대의 「최신 데일리 로그」까지만 노출
  → 이전 로그 / 개별 로그는 프로필 진입 후 상세에서만 접근 가능
```

---

## 리프레시 (「새로운 3명 보기」) 로직

```typescript
// 리프레시 시: 새 3명이 페이지네이션 위에 쌓이고 기존은 아래로 밀림
// 스와이프로 이전 페이지 접근 가능

const [pages, setPages] = useState<CurationUser[][]>([initialPool]);  // [[최신], [이전], ...]
const [hasMore, setHasMore] = useState(true);

async function handleRefresh() {
  posthog.capture('refresh_attempted', {
    has_item: hasMore,
    current_pool_size: pages[0].length,
  });

  if (!hasMore) {
    navigation.navigate('H4');  // 아이템 소진 → H4 화면
    return;
  }

  const newPool = await fetchNewPool(userId, excludeIds);  // 기존 노출 제외
  if (!newPool || newPool.length < 3) {
    navigation.navigate('H4');
    return;
  }

  setPages(prev => [newPool, ...prev]);  // 새 3명 맨 앞에 추가
  scrollToTop();                          // 새 페이지로 스크롤
}

// 도트 인디케이터 — 현재 페이지 반영
<View style={styles.dots}>
  {pages.map((_, i) => (
    <View key={i} style={[styles.dot, currentPage === i && styles.dotActive]} />
  ))}
</View>
```

---

## 정오 자동 갱신 토스트

```typescript
// 정오(12:00) 도달 시 in-session 토스트 노출

useEffect(() => {
  const timer = setInterval(() => {
    const now = new Date();
    if (now.getHours() === 12 && now.getMinutes() === 0) {
      showToast({
        message: '새로운 추천이 도착했어요',
        action: { label: '확인', onPress: handleNoonRefresh },
        duration: 10_000,
      });
      posthog.capture('midnight_pool_toast_shown');
    }
  }, 30_000); // 30초 간격 체크
  return () => clearInterval(timer);
}, []);

async function handleNoonRefresh() {
  posthog.capture('midnight_pool_toast_clicked');
  const newPool = await fetchCurationPool(userId);
  setPages([[...newPool]]);  // 신규 풀로 완전 교체
}

// 토스트 무시 시: 기존 카드 유지 (setPages 호출 없음)
```

---

## H2 전체 화면 구현

```tsx
// screens/home/HomeScreen.tsx

export default function HomeScreen() {
  const { pool, hasAnyVideo, canLike, remainingLikes, setRemainingLikes, screen, loading, refresh } = useHomeScreen();
  const [pages, setPages] = useState<CurationUser[][]>([]);

  useEffect(() => {
    if (pool.length >= 3) setPages([pool]);
  }, [pool]);

  if (loading) return <LoadingSpinner />;
  if (screen === 'H3') return <H3EmptyScreen hasAnyVideo={hasAnyVideo} />;

  function handleLike(targetUserId: string) {
    if (!canLike) return;
    supabase.from('likes').insert({
      from_user_id: userId,
      to_user_id: targetUserId,
      liked_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (!error) {
        setRemainingLikes(prev => prev - 1);
        showToast('좋아요를 보냈어요 ♥');
      }
    });
  }

  function handleCardTap(targetUserId: string) {
    posthog.capture('curation_card_tapped', {
      card_position: pool.findIndex(u => u.id === targetUserId) + 1,
      curated_user_id: anonymize(targetUserId),
    });
    navigation.navigate('Profile', { userId: targetUserId });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 바 */}
      <HomeTopBar />

      {/* B2 배너 — 영상 미업로드 시만 */}
      {!hasAnyVideo && <B2Banner />}

      {/* 카드 영역 */}
      <View style={styles.cardsWrap}>

        {/* 3명 카드 */}
        {pages[0]?.map((user, i) => (
          <CurationCard
            key={user.id}
            user={user}
            position={(i + 1) as 1 | 2 | 3}
            canLike={canLike}
            onLike={handleLike}
            onCardTap={handleCardTap}
          />
        ))}

        {/* 우측 도트 인디케이터 */}
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === 0 && styles.dotOn]} />
          ))}
        </View>

        {/* 부유 FAB */}
        <TouchableOpacity style={styles.fab} onPress={handleRefresh}>
          <Text style={styles.fabTxt}>새로운 3명 보기</Text>
        </TouchableOpacity>
      </View>

      {/* 탭바 */}
      <TabBar active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F5EDDB' },
  cardsWrap:  { flex: 1, position: 'relative' },
  dots: {
    position: 'absolute', right: 8, top: '50%',
    transform: [{ translateY: -20 }],
    gap: 5, zIndex: 10,
  },
  dot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { backgroundColor: '#fff' },
  fab: {
    position: 'absolute', bottom: 14, alignSelf: 'center',
    backgroundColor: 'rgba(23,19,16,0.85)',
    borderRadius: 20, paddingVertical: 7, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  fabTxt: { color: '#fff', fontSize: 12 },
});
```

---

## 📊 PostHog 트래킹

### curation_pool_loaded `P0`
```typescript
// 풀 페칭 완료 시
posthog.capture('curation_pool_loaded', {
  pool_size:          pool.length,
  has_any_video:      hasAnyVideo,          // 영상 업로드 이력 여부
  b2_banner_shown:    !hasAnyVideo,         // 배너 노출 여부
  remaining_likes:    remainingLikes,       // 오늘 잔여 좋아요 횟수
  refresh_item_count: pages.length - 1,
  is_first_visit:     isFirstVisit,
});
```

### curation_card_viewed `P1`
```typescript
// 카드 viewport 50%+ 노출 시
posthog.capture('curation_card_viewed', {
  card_position:    position,               // 1~3
  curated_user_id:  anonymize(user.id),
});
```

### curation_card_tapped `P0`
```typescript
posthog.capture('curation_card_tapped', {
  card_position:   position,
  curated_user_id: anonymize(user.id),
});
```

### refresh_attempted `P0`
```typescript
posthog.capture('refresh_attempted', {
  has_item:          hasMore,
  current_pool_size: pages[0].length,
});
```

### midnight_pool_toast_shown / clicked `P1`
```typescript
posthog.capture('midnight_pool_toast_shown');
posthog.capture('midnight_pool_toast_clicked');
```

---

## 🔗 화면 전환 플로우

```
홈 탭 진입
    │
    ├─ 풀 3명 이상 ──────────────────────────────→ H2
    │     │
    │     ├─ 영상 미업로드 ─────────────────────→ H2-A (B2 배너, 좋아요 비노출)
    │     └─ 영상 1건 이상 업로드 ───────────────→ H2-B (배너 없음, 좋아요 활성)
    │
    └─ 풀 3명 미만 ──────────────────────────────→ H3 (TASK_04 참조)

H2 내 인터랙션:
    ├─ 카드 탭 ─────────────────────────────────→ 프로필 화면
    ├─ 좋아요 탭 (canLike = true) ────────────→ likes INSERT + 토스트 + remainingLikes--
    ├─ 좋아요 비노출 (canLike = false) ──────────→ 인터랙션 없음
    ├─ 「새로운 3명 보기」 + 아이템 ─────────────→ 새 3명 페이지네이션 상단 추가
    ├─ 「새로운 3명 보기」 + 아이템 소진 ────────→ H4
    ├─ 정오 토스트 탭 ──────────────────────────→ 신규 풀로 갱신 (H2 유지)
    ├─ 정오 토스트 무시 ────────────────────────→ 기존 카드 유지 (H2 유지)
    └─ 탭바 → 촬영 탭 ──────────────────────────→ CameraScreen (TASK_03 참조)
```

---

## 📁 파일 구조

```
src/
  screens/
    home/
      HomeScreen.tsx              ← H2/H3 분기 + 전체 조합
  components/
    home/
      CurationCard.tsx            ← 개별 영상 카드 (좋아요 버튼 포함)
      B2Banner.tsx                ← 영상 미업로드 배너 (TASK_04 공용)
      HomeTopBar.tsx              ← 로고 + 알림 벨 (TASK_04 공용)
  hooks/
    useHomeScreen.ts              ← 풀 fetch + 좋아요 자격 통합
    useLike.ts                    ← 좋아요 상태 + 전송
  utils/
    dateHelpers.ts                ← getToday(), getYesterday()
    anonymize.ts                  ← PostHog용 ID 익명화
```

---

## ⚙️ 구현 시 주의사항

1. **캐시 없음**: 홈 진입마다 `fetchCurationPool` 새로 호출 — 오래된 데이터 표시 방지
2. **영상 3개 동시 재생**: `shouldPlay={true}` + 음소거 기본. 배터리/성능 고려 시 viewport 진입 시에만 play
3. **좋아요 숨김 처리**: `canLike = false` 시 버튼 `display: none` — `opacity: 0.3 + disabled` 아님
4. **좋아요 잔여 횟수**: 화면 마운트 시 `getRemainingLikesToday()` 호출해 초기화. 좋아요 전송 성공 시 클라이언트 상태도 즉시 감소
5. **스크롤 없음**: 3카드가 각 1/3 높이로 화면을 꽉 채움 — `flex: 1` 균등 분배
6. **도트 인디케이터**: 리프레시 전 첫 진입 시 dot 1개만 표시
7. **§4.6 영상 접근**: 카드 영상 = 항상 최신 데일리 로그 URL. 개별 로그는 프로필 상세에서만
8. **익명화**: PostHog `curated_user_id`는 실제 UUID 아닌 해시값 사용
9. **과금 확장**: `FREE_DAILY_QUOTA` 상수를 별도 분리해 PAID 플랜 추가 시 `user.daily_like_quota` 로 교체 용이하게 유지

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 풀 3명 이상 시 H2 정상 진입
- [ ] 3카드 각 1/3 높이 세로 배치, 영상 풀스크린 자동 재생 (음소거 기본)
- [ ] 좌하단 닉네임·나이·지역 반투명 칩 노출
- [ ] 우하단 음소거 개별 토글 동작
- [ ] B2 배너: 영상 미업로드(전체 기간) 시 노출, 1건 이상 업로드 시 숨김
- [ ] 좋아요 버튼: `canLike = true` (영상 이력 있음 + 오늘 잔여 횟수 > 0) 시만 노출
- [ ] 좋아요 전송 성공 시 `remainingLikes` 즉시 감소 + 토스트
- [ ] 좋아요 하루 FREE 1회 제한 (화면 마운트 시 잔여 횟수 확인)
- [ ] 「새로운 3명 보기」 탭 → 페이지네이션 상단 추가 or H4
- [ ] 도트 인디케이터 페이지 수 반영
- [ ] 정오 토스트: 탭 시 신규 풀 갱신 / 무시 시 기존 유지
- [ ] PostHog 5종 이벤트 연동 (`has_any_video`, `remaining_likes` 포함)
- [ ] `checkHasAnyVideo`, `getRemainingLikesToday` 단위 테스트

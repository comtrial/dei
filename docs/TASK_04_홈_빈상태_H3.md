# TASK · 04 홈 화면 — 빈 상태 (H3 Empty Screen)

> **작업 범위**: 홈 화면 진입 시 풀 부족 케이스 처리  
> **연관 화면**: H2 (정상 큐레이션), B2 배너, 탭바  
> **담당**: 손승태 · collaborator 최승원  
> **우선순위**: P0  
> **Supabase 테이블**: `logs`, `curation_pool`  
> **기획서 참조**: §8.2 — 풀 부족 시 억지로 채우지 않음

---

## 📐 구현 대상

| ID | 상태 | 진입 조건 |
|----|------|----------|
| H3-A | 빈 상태 + B2 배너 노출 | 영상 미업로드 (전체 기간) + 큐레이션 풀 없음/부족 |
| H3-B | 빈 상태 (배너 없음) | 영상 1건 이상 업로드 + 큐레이션 풀 없음/부족 |
| H2 | 정상 큐레이션 | 풀 3명 이상 정상 존재 |

---

## 🗺️ 홈 화면 진입 라우팅 로직

홈 탭 진입 시 아래 순서로 분기:

```typescript
async function resolveHomeScreen(userId: string): Promise<'H2' | 'H3'> {
  const now = new Date();
  const hour = now.getHours();

  // 1. 정오 이전이면 어제 풀 그대로 사용 (갱신 없음)
  // 2. 정오(12:00) 이후 자동 갱신 → 새 풀 fetch
  const poolFetchDate = hour < 12
    ? getYesterday()   // 정오 이전: 어제 날짜 풀
    : getToday();      // 정오 이후: 오늘 날짜 풀

  // 큐레이션 풀 조회
  // 조건: 검수_YN = 'Y', 차단_YN = 'N', user_id != 본인
  const { data: pool } = await supabase
    .from('curation_pool')
    .select('*')
    .eq('pool_date', poolFetchDate)
    .neq('user_id', userId)
    .eq('검수_YN', 'Y')
    .eq('차단_YN', 'N');

  if (!pool || pool.length < 3) return 'H3';  // 풀 없음 or 3명 미만
  return 'H2';
}

// 내 영상 업로드 이력 (전체 기간 — 좋아요 배너 노출 조건)
async function hasAnyVideo(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('logs')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
```

### 분기 요약

```
홈 탭 진입
    │
    ├─ 풀 3명 이상 ──────────────────────────────→ H2 (정상 큐레이션)
    │
    └─ 풀 없음 or 3명 미만 ──────────────────────→ H3 (빈 상태)
              │
              ├─ 영상 미업로드(전체 기간) ─────────→ H3-A (B2 배너 포함)
              └─ 영상 1건 이상 업로드 ────────────→ H3-B (배너 없음)
```

---

## H3 · 빈 상태 화면

### 핵심 원칙 (§8.2)
- 풀이 부족할 때 **억지로 채우지 않음** — 빈 상태를 그대로 보여줌
- 정오 이전 진입: 어제 풀 그대로 유지 (갱신 없음)
- 정오 도달: 자동으로 H2 전환 시도 (polling or realtime)

### 레이아웃

```
┌─────────────────────────────┐
│  dei.                   🔔  │  ← 상단 바 (알림 아이콘 정상 노출)
├─────────────────────────────┤
│  [B2 배너 — 영상 미업로드 시만] │  ← 조건부 노출
├─────────────────────────────┤
│                             │
│         🌙 일러스트          │
│                             │
│   오늘은 어울리는 친구를     │
│   찾기 어려워요.             │
│   내일 다시 만나요           │
│                             │
│      [정오에 자동 갱신]      │  ← 서브 안내 칩
│                             │
├─────────────────────────────┤
│   🏠홈   📹촬영   👤나      │  ← 탭바 정상 노출
└─────────────────────────────┘
```

### 구현 코드

```tsx
// screens/home/HomeScreen.tsx

export default function HomeScreen() {
  const { userId } = useAuth();
  const [screen, setScreen] = useState<'loading' | 'H2' | 'H3'>('loading');
  const [videoUploaded, setVideoUploaded] = useState(false);

  useEffect(() => {
    async function init() {
      const [screenType, anyVideo] = await Promise.all([
        resolveHomeScreen(userId),
        hasAnyVideo(userId),
      ]);
      setScreen(screenType);
      setVideoUploaded(anyVideo);
    }
    init();
  }, []);

  // 정오 자동 갱신 — H3일 때만 polling
  useEffect(() => {
    if (screen !== 'H3') return;
    const timer = setInterval(async () => {
      const next = await resolveHomeScreen(userId);
      if (next === 'H2') setScreen('H2');
    }, 60_000); // 1분마다 체크
    return () => clearInterval(timer);
  }, [screen]);

  if (screen === 'loading') return <LoadingSpinner />;
  if (screen === 'H2') return <CurationScreen />;   // H2 컴포넌트

  // H3 빈 상태
  return (
    <SafeAreaView style={styles.container}>
      <HomeTopBar />
      {!videoUploaded && <B2Banner />}   {/* 영상 미업로드 시만 배너 노출 */}
      <H3EmptyContent />
    </SafeAreaView>
  );
}
```

### H3EmptyContent 컴포넌트

```tsx
// components/home/H3EmptyContent.tsx

export function H3EmptyContent() {
  return (
    <View style={styles.container}>

      {/* 일러스트 영역 */}
      <View style={styles.illustWrap}>
        {/* 달 + 별 SVG or 이미지 에셋 사용 */}
        <Image
          source={require('@/assets/illustrations/empty-moon.png')}
          style={styles.illust}
          resizeMode="contain"
        />
      </View>

      {/* 안내 문구 */}
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          오늘은 어울리는 친구를{'\n'}찾기 어려워요.
        </Text>
        <Text style={styles.sub}>내일 다시 만나요</Text>
      </View>

      {/* 정오 갱신 안내 칩 */}
      <View style={styles.refreshChip}>
        <Text style={styles.refreshText}>정오에 자동 갱신</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  illustWrap: {
    width: 120, height: 120,
    alignItems: 'center', justifyContent: 'center',
  },
  illust: { width: 100, height: 100 },
  textWrap: { alignItems: 'center', gap: 6 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171310',
    textAlign: 'center',
    lineHeight: 24,
  },
  sub: {
    fontSize: 13,
    color: '#6E6354',
    textAlign: 'center',
  },
  refreshChip: {
    backgroundColor: '#EDE4D0',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  refreshText: {
    fontSize: 11,
    color: '#6E6354',
    fontFamily: 'mono',
  },
});
```

---

## B2 배너 — 영상 미업로드 시 노출

> **노출 조건**: H3 진입 + 영상을 한 번도 업로드하지 않은 경우  
> **숨김 조건**: 영상 1건 이상 업로드 완료 (H3-B 케이스)

```tsx
// components/home/B2Banner.tsx

export function B2Banner() {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => navigation.navigate('CameraScreen')}
    >
      <Text style={styles.icon}>📹</Text>
      <Text style={styles.text}>
        영상을 찍으면{'\n'}좋아요를 보낼 수 있어요
      </Text>
      <Text style={styles.cta}>촬영 →</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#EDE4D0',
    borderRadius: 10,
    padding: 12,
  },
  icon: { fontSize: 16 },
  text: { flex: 1, fontSize: 12, color: '#6E6354', lineHeight: 18 },
  cta:  { fontSize: 12, color: '#C0432A', fontWeight: '600' },
});
```

---

## 상단 바 — HomeTopBar

```tsx
// components/home/HomeTopBar.tsx
// H2, H3 공통 사용

export function HomeTopBar() {
  const { hasUnread } = useNotifications();

  return (
    <View style={styles.bar}>
      <Text style={styles.logo}>dei.</Text>
      <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
        <View style={styles.bellWrap}>
          <Text style={styles.bell}>🔔</Text>
          {hasUnread && <View style={styles.dot} />}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  logo: { fontSize: 18, fontWeight: '700', color: '#171310', letterSpacing: -0.5 },
  bellWrap: { position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  bell: { fontSize: 18 },
  dot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: '#C0432A',
    borderWidth: 1.5, borderColor: '#F5EDDB',
  },
});
```

---

## 정오 자동 갱신 로직

```typescript
// H3 상태일 때 1분 polling으로 H2 전환 감지

useEffect(() => {
  if (screen !== 'H3') return;

  const timer = setInterval(async () => {
    const now = new Date();

    // 정오 도달 확인
    if (now.getHours() >= 12) {
      const next = await resolveHomeScreen(userId);
      if (next === 'H2') {
        setScreen('H2');
        clearInterval(timer);
      }
    }
  }, 60_000); // 1분 간격

  return () => clearInterval(timer);
}, [screen]);

// 앱 foreground 복귀 시에도 재확인
useAppState((state) => {
  if (state === 'active' && screen === 'H3') {
    resolveHomeScreen(userId).then((next) => {
      if (next === 'H2') setScreen('H2');
    });
  }
});
```

---

## 📊 PostHog 트래킹

### curation_pool_empty_shown `P0`

```typescript
// H3 화면 마운트 시 즉시 호출

useEffect(() => {
  if (screen !== 'H3') return;

  posthog.capture('curation_pool_empty_shown', {
    reason: pool === null ? 'no_pool' : 'pool_too_small',  // no_pool | pool_too_small
    has_any_video: videoUploaded,                           // 영상 업로드 이력 여부
    is_first_visit: isFirstVisit,                           // 첫 앱 진입 여부
    time_since_signup_hours: getHoursSinceSignup(user.created_at),
  });
}, [screen]);
```

| prop | 타입 | 설명 |
|------|------|------|
| `reason` | `'no_pool' \| 'pool_too_small'` | 풀 자체 없음 vs 3명 미만 |
| `has_any_video` | `boolean` | 영상 업로드 이력 여부 (B2 배너 노출 반영) |
| `is_first_visit` | `boolean` | 가입 후 첫 홈 진입 여부 |
| `time_since_signup_hours` | `number` | 가입 후 경과 시간(시간 단위) |

> **목적**: Risk B 측정 — 신규 첫 진입 시 빈 상태 발생률 추적

---

## 🔗 화면 전환 플로우

```
탭바 [홈] 탭 진입
    │
    ├─ resolveHomeScreen() 호출
    │       │
    │       ├─ 풀 3명 이상 ──────────────────→ H2 정상 큐레이션
    │       │
    │       └─ 풀 없음 or 3명 미만 ──────────→ H3 빈 상태
    │                   │
    │                   ├─ 영상 미업로드 ─────→ H3-A (B2 배너 포함)
    │                   └─ 영상 1건 이상 ─────→ H3-B (배너 없음)
    │
    ├─ [B2 배너 탭] ───────────────────────→ CameraScreen (01A)
    │
    ├─ [탭바 다른 탭] ──────────────────────→ 해당 탭 화면
    │
    └─ 정오 도달 (polling 감지) ────────────→ H2로 자동 전환
```

---

## 📁 파일 구조

```
src/
  screens/
    home/
      HomeScreen.tsx          ← H2/H3 분기 + 정오 polling
  components/
    home/
      H3EmptyContent.tsx      ← 빈 상태 일러스트 + 문구
      B2Banner.tsx            ← 영상 미업로드 배너
      HomeTopBar.tsx          ← 상단 dei. 로고 + 알림 벨 (H2/H3 공용)
  hooks/
    useHomeScreen.ts          ← resolveHomeScreen, hasAnyVideo 로직
    useNotifications.ts       ← 알림 읽음 상태
  utils/
    dateHelpers.ts            ← getToday(), getYesterday(), getHoursSinceSignup()
assets/
  illustrations/
    empty-moon.png            ← H3 일러스트 에셋
```

---

## ⚙️ 구현 시 주의사항

1. **풀 억지 채우기 금지**: 3명 미만이면 무조건 H3 노출. 더미 카드 채우기 없음 (§8.2)
2. **정오 기준**: 기기 로컬 시간 기준. 서버 시간과 최대 수초 오차 허용
3. **어제 풀 유지**: 정오 이전 진입 시 `poolFetchDate = getYesterday()` — 전날 풀을 그대로 사용
4. **B2 배너**: H3일 때만 조건 평가. 영상 업로드 이력(전체 기간) 기준으로 노출 결정
5. **알림 벨**: H2/H3 공통 `HomeTopBar` 컴포넌트 사용. 읽지 않은 알림 존재 시 빨간 dot
6. **탭바**: H3에서도 탭바 정상 동작 — 다른 탭 이동 가능
7. **Polling 정리**: H3 → H2 전환 시 `clearInterval` 반드시 호출
8. **앱 복귀 감지**: background → foreground 복귀 시에도 `resolveHomeScreen` 재호출

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 풀 3명 미만 → H3, 3명 이상 → H2 분기 정상 동작
- [ ] H3-A: 영상 미업로드 시 B2 배너 노출
- [ ] H3-B: 영상 1건 이상 업로드 시 배너 숨김
- [ ] H3: 일러스트 + 안내 문구 + 정오 갱신 칩 노출
- [ ] 정오 polling: 1분 간격 체크, H2 전환 시 인터벌 정리
- [ ] 앱 foreground 복귀 시 재분기
- [ ] 정오 이전 진입: 어제 풀 기준으로 분기
- [ ] 상단 알림 벨 정상 노출 (unread dot 포함)
- [ ] 탭바 정상 노출 및 탭 이동 동작
- [ ] PostHog `curation_pool_empty_shown` 이벤트 — reason / has_any_video / is_first_visit / time_since_signup_hours
- [ ] 풀 fetch 실패 시 H3 fallback 처리

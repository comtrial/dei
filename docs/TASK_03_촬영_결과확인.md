# TASK · 03 로그 촬영 → 결과 확인 (Recording + Result Flow)

> **작업 범위**: 셔터 버튼 누름 → 3초 촬영 진행 → 결과 확인 화면(R4) → 저장/취소/재촬영  
> **선행 작업**: `TASK_01_카메라진입.md` (01A 카메라 대기 화면) 완료 후 진행  
> **담당**: 손승태 · collaborator 최승원  
> **우선순위**: P0  
> **Supabase 테이블**: `logs`

---

## 📐 구현 대상 (3개 상태)

| ID | 상태 | 컴포넌트 유형 |
|----|------|--------------|
| RECORDING | 촬영 진행 중 (3초) | 01A 위 오버레이 상태 변환 |
| R4 | 결과 확인 화면 | Screen (풀스크린) |
| R4-SAVE | 저장 중 로딩 | R4 위 로딩 오버레이 |

---

## 🎨 디자인 토큰 (TASK_01과 동일)

```
배경 (카메라/결과 뷰):  #1A1008
텍스트 흰색:            #FFFFFF
텍스트 서브:            rgba(255,255,255,0.4)
버튼 Danger/저장:       #C0432A  (적갈색)
버튼 Secondary:         border: rgba(255,255,255,0.3), 투명 배경
진행 링 색:             #C0432A
Border radius 버튼:     8px
폰트:                   -apple-system, 'Pretendard', sans-serif
모노:                   ui-monospace, 'SF Mono'
```

---

## RECORDING · 촬영 진행 중

> 01A 카메라 화면에서 셔터 버튼 `LongPress` 시작 시점부터 상태 전환

### 레이아웃 변화 (01A → RECORDING)

| 요소 | 01A 상태 | RECORDING 상태 |
|------|---------|---------------|
| 타이머 | `00:00` (흰색) | `00:00 → 00:03` 카운트업 (적갈색 `#C0432A`) |
| 셔터 버튼 | 흰 원 | 정지 버튼(흰 사각형, 라운드 4px)으로 교체 |
| 진행 링 | 없음 | 셔터 주위 conic-gradient 링 (`#C0432A`) |
| 하단 프로그레스 바 | 없음 | 가로 바 (뷰파인더 하단, 0→100%, 3초 동안) |
| 닫기(X) | 활성화 | **비활성화** (opacity 0.3, 터치 무반응) |
| 카메라 전환 | 활성화 | **비활성화** |

### 촬영 진행 로직

```typescript
const RECORD_DURATION_MS = 3000;  // MVP 고정값 (단일 영상 1개)

onLongPressStart() {
  startRecording();           // expo-camera recording 시작
  startProgressAnimation();   // 0→100% 3초 linear
  startTimer();               // 00:00 카운트업
}

// 3초 경과 시 자동 정지 → R4로 이동
setTimeout(() => {
  stopRecording();
  navigateTo('R4');
}, RECORD_DURATION_MS);

// 사용자가 정지 버튼 탭 시 (3초 이전이면 무시)
onStopPress() {
  if (elapsedMs < 3000) return;
  stopRecording();
  navigateTo('R4');
}
```

### 진행 링 (React Native)

```tsx
import * as Progress from 'react-native-progress';

<Progress.Circle
  progress={elapsedMs / 3000}
  size={64}
  borderWidth={0}
  unfilledColor="rgba(255,255,255,0.15)"
  color="#C0432A"
  thickness={3}
/>
// 내부에 정지 버튼 absolute 배치
```

---

## R4 · 결과 확인 화면

### 핵심 원칙
- **영상이 화면 전체를 채운다** — `StyleSheet.absoluteFillObject` 풀스크린
- 상단 바, 배지, 버튼은 모두 영상 위에 `position: absolute` float
- 시간대 배지는 **배경 없이 텍스트만** 영상 위에 노출 (박스/카드 없음)
- 한 번 촬영 = 영상 1개. 세그먼트/멀티샷 없음

### 레이아웃

```
┌─────────────────────────┐
│  [취소]              🔇 │  ← 상단 바 (absolute, 영상 위 float)
│                         │
│  ● LOOP                 │  ← 루프 인디케이터 (좌상단, absolute)
│                         │
│                         │
│    [촬영 영상 풀스크린]  │  ← Video: absoluteFillObject
│                         │
│                         │
│           낮            │  ← 시간대 텍스트만 (배경 없음, absolute)
│          00:03          │  ← 영상 길이 서브텍스트 (배경 없음)
│                         │
│  [다시 촬영]   [저장]    │  ← 하단 버튼 (그라디언트 레이어 위)
└─────────────────────────┘
```

---

## 시간대 표기 유틸

> 표시 텍스트는 시간대 이름만. 숫자(N시) 표기 없음.

```typescript
// utils/timeOfDay.ts

export function getTimeOfDay(hour: number): string {
  if (hour < 5)  return '새벽';   // 00 ~ 04시
  if (hour < 12) return '오전';   // 05 ~ 11시
  if (hour < 17) return '낮';     // 12 ~ 16시
  if (hour < 21) return '저녁';   // 17 ~ 20시
  return '밤';                    // 21 ~ 23시
}

// 사용
const hour = new Date().getHours();   // 촬영 완료 시점
const timeLabel = getTimeOfDay(hour); // → "낮" | "오전" | "새벽" | "저녁" | "밤"
```

단위 테스트 케이스:

```typescript
// utils/timeOfDay.test.ts
test('새벽: 0~4시', () => {
  expect(getTimeOfDay(0)).toBe('새벽');
  expect(getTimeOfDay(4)).toBe('새벽');
});
test('오전: 5~11시', () => {
  expect(getTimeOfDay(5)).toBe('오전');
  expect(getTimeOfDay(11)).toBe('오전');
});
test('낮: 12~16시', () => {
  expect(getTimeOfDay(12)).toBe('낮');
  expect(getTimeOfDay(16)).toBe('낮');
});
test('저녁: 17~20시', () => {
  expect(getTimeOfDay(17)).toBe('저녁');
  expect(getTimeOfDay(20)).toBe('저녁');
});
test('밤: 21~23시', () => {
  expect(getTimeOfDay(21)).toBe('밤');
  expect(getTimeOfDay(23)).toBe('밤');
});
```

---

## R4 전체 구현 코드

```tsx
// screens/recording/ResultScreen.tsx
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { getTimeOfDay } from '@/utils/timeOfDay';
import { formatDuration } from '@/utils/formatDuration';

export default function ResultScreen({ route, navigation }) {
  const { tempVideoUri, recordedMs, entryPoint, isFirstLog } = route.params;
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(false);

  const hour = new Date().getHours();           // 촬영 완료 시점 고정
  const timeLabel = getTimeOfDay(hour);         // "낮" | "오전" 등

  return (
    <View style={{ flex: 1, backgroundColor: '#1A1008' }}>

      {/* 1. 영상 — 풀스크린 베이스 레이어 */}
      <Video
        source={{ uri: tempVideoUri }}
        shouldPlay={true}
        isLooping={true}
        isMuted={muted}
        resizeMode={ResizeMode.COVER}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 2. 상단 바 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMuted(!muted)}>
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* 3. LOOP 인디케이터 */}
      <View style={styles.loopBadge}>
        <View style={styles.loopDot} />
        <Text style={styles.loopText}>LOOP</Text>
      </View>

      {/* 4. 시간대 배지 — 배경 없음, 텍스트만 */}
      <View style={styles.hourBadge}>
        <Text style={styles.hourText}>{timeLabel}</Text>
        <Text style={styles.durationText}>{formatDuration(recordedMs)}</Text>
      </View>

      {/* 5. 하단 버튼 영역 */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.bottomGradient}
      >
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleRedo} disabled={loading}>
            <Text style={styles.btnSecondaryText}>다시 촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
            <Text style={styles.btnPrimaryText}>{loading ? '저장 중...' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cancelText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: 'mono' },
  muteIcon:   { fontSize: 16 },

  loopBadge: {
    position: 'absolute', top: 100, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7,
  },
  loopDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C0432A' },
  loopText: { color: '#fff', fontSize: 9, fontFamily: 'mono' },

  hourBadge: {
    position: 'absolute', bottom: 80,
    alignSelf: 'center', alignItems: 'center', gap: 2,
    // backgroundColor 없음 — 텍스트만
  },
  hourText:     { color: '#fff', fontSize: 20, fontFamily: 'mono', letterSpacing: 2, fontWeight: '500' },
  durationText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'mono' },

  bottomGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 40, paddingBottom: 36, paddingHorizontal: 14,
  },
  actionRow:        { flexDirection: 'row', gap: 10 },
  btnSecondary:     { flex: 1, height: 44, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  btnPrimary:       { flex: 1, height: 44, borderRadius: 8, backgroundColor: '#C0432A', alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:   { color: '#fff', fontSize: 14, fontWeight: '600' },
})
```

---

## R4 인터랙션 — 버튼별 동작

### [취소] 탭

```typescript
async function handleCancel() {
  await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
  navigation.goBack();
  posthog.capture('log_save_cancelled', { duration_sec: Math.round(recordedMs / 1000) });
}
```

### [다시 촬영] 탭

```typescript
async function handleRedo() {
  await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
  navigateTo('CameraScreen');
  posthog.capture('log_redo_clicked');
}
```

### [저장] 탭 → 서버 등록

```typescript
async function handleSave() {
  setLoading(true);

  // 1. Supabase Storage 업로드
  const { data: uploadData, error: uploadError } =
    await supabase.storage
      .from('logs')
      .upload(`${userId}/${Date.now()}.mp4`, videoBlob, {
        contentType: 'video/mp4',
        upsert: false,
      });

  if (uploadError) {
    showToast('저장에 실패했어요. 다시 시도해주세요');
    setLoading(false);
    return;                         // R4 화면 유지
  }

  // 2. logs 테이블 INSERT
  const { data: logData } = await supabase
    .from('logs')
    .insert({
      user_id:      userId,
      video_url:    uploadData.path,
      hour_slot:    new Date().getHours(),
      duration_sec: Math.round(recordedMs / 1000),
      검수_YN:      'N',            // 관리자 검수 대기 상태
      검수_상태:    'PENDING',
      recorded_at:  new Date().toISOString(),
    });

  // 3. 데일리 로그 재계산 RPC
  await supabase.rpc('recalculate_daily_log', { p_user_id: userId });

  // 4. 임시 파일 삭제
  await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });

  // 5. PostHog — INSERT 성공 후 호출
  posthog.capture('log_recorded', {
    log_id:       logData.id,
    duration_sec: Math.round(recordedMs / 1000),
    hour_slot:    new Date().getHours(),
    is_first_log: isFirstLog,
    entry_point:  entryPoint,
  });

  setLoading(false);
  navigation.navigate('Home');
}
```

---

## 관리자 연계 (Admin Integration)

```
logs INSERT 시:
  검수_YN    = 'N'        → 관리자 A3 검수 큐에 자동 등록
  검수_상태  = 'PENDING'

관리자 처리 후:
  검수_YN    = 'Y'        → 큐레이션 풀 노출 자격
  검수_상태  = 'APPROVED' | 'REJECTED'

큐레이션 풀 노출 조건:
  SELECT * FROM logs WHERE 검수_YN = 'Y' AND user_id != current_user
```

> 저장 직후 유저에게 "저장되었어요!" 토스트 노출.  
> 검수 결과 Push 알림은 MVP 이후 구현.

---

## 데일리 로그 재계산 정책

```
recalculate_daily_log RPC:
  - 오늘 날짜 기준 유저 logs 조회
  - 서로 다른 hour_slot 3개 이상 → daily_log = COMPLETED
  - 3개 미만                     → daily_log = INCOMPLETE
  - 완성 시 몽타주 병합 Edge Function 트리거

정책:
  §3.2 — 서로 다른 시각 3개 이상 누적 시 데일리 로그 자동 생성
  §3.2 — 최소 3시간 범위 필요 (09·10·11시 OK / 09·09·09시 불가)
  B8   — 데일리 로그 1개+ 보유 시 큐레이션 풀 노출 자격
```

---

## 🔗 화면 전환 플로우

```
[01A 카메라 대기]
    │
    └─ 셔터 LongPress ───────────→ [RECORDING 진행 중]
                                        │
                                        ├─ 3초 경과 (자동) ──→ [R4 결과 확인]
                                        └─ 정지 탭 (3초↑) ──→ [R4 결과 확인]

[R4 결과 확인]
    ├─ [취소]      → 임시파일 삭제 → 홈/탭바
    ├─ [다시 촬영] → 임시파일 삭제 → 01A 카메라 대기
    └─ [저장]      → Storage 업로드
                   → logs INSERT (검수_YN=N, hour_slot=현재시)
                   → recalculate_daily_log RPC
                   → 임시파일 삭제
                   → 홈/탭바
```

---

## 📁 파일 구조

```
src/
  screens/
    recording/
      CameraScreen.tsx        ← 01A (기존)
      RecordingOverlay.tsx    ← RECORDING 상태 오버레이
      ResultScreen.tsx        ← R4 결과 확인
  components/
    recording/
      ProgressRing.tsx        ← 촬영 진행 링
      RecordingActionBar.tsx  ← [다시 촬영] [저장]
  utils/
    timeOfDay.ts              ← getTimeOfDay(hour): "낮"|"오전" 등
    formatDuration.ts         ← ms → "00:03" 포맷
  hooks/
    useRecording.ts           ← 촬영 상태 (start/stop/timer)
    useSaveLog.ts             ← Storage 업로드 + INSERT + RPC
  lib/
    supabase/
      rpc/recalculate_daily_log.ts
```

---

## ⚙️ 구현 시 주의사항

1. **단일 영상**: 한 번 촬영 = 영상 1개. 세그먼트/멀티샷 구조 없음
2. **영상 풀스크린**: `Video`에 `StyleSheet.absoluteFillObject`. 나머지 UI는 모두 `position: absolute`
3. **배지 배경 없음**: `hourBadge`에 `backgroundColor` 지정하지 않음. 텍스트만 영상 위 노출
4. **시간대 표기**: `getTimeOfDay()` 반환값만 표시. "N시" 숫자 표기 없음
5. **음소거 기본**: `isMuted` 초기값 `true`
6. **임시 파일 삭제**: 취소/재촬영/저장 완료 세 경우 모두 `FileSystem.deleteAsync` 호출
7. **저장 중 이중 탭 방지**: `loading === true`일 때 버튼 `disabled` 처리
8. **PostHog**: `log_recorded`는 Supabase INSERT 성공 후 호출

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 셔터 LongPress → 진행 링 + 타이머 카운트업 + 프로그레스 바 애니메이션
- [ ] 3초 경과 자동 정지 → R4 전환
- [ ] R4: 영상 풀스크린 (`absoluteFillObject`), 루프 재생, 음소거 기본
- [ ] R4: 시간대 텍스트 배경 없이 영상 위 표시
- [ ] 시간대 자동 분기: 새벽(0-4) / 오전(5-11) / 낮(12-16) / 저녁(17-20) / 밤(21-23)
- [ ] `getTimeOfDay()` 단위 테스트 5개 구간 통과
- [ ] R4: 영상 길이(00:03) 서브 텍스트 표시
- [ ] [취소]: 임시 파일 삭제 + 홈 복귀 + PostHog
- [ ] [다시 촬영]: 임시 파일 삭제 + 카메라 화면 복귀 + PostHog
- [ ] [저장]: Storage 업로드 → logs INSERT (검수_YN=N) → RPC → 홈 복귀
- [ ] 저장 실패 시 토스트, R4 유지, 버튼 재활성화
- [ ] PostHog 3종 연동 (log_recorded / log_save_cancelled / log_redo_clicked)

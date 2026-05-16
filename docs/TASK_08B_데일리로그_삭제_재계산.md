# TASK · 08B 데일리 로그 삭제 + 날짜 그룹 재계산 (DL6~DL8)

> **작업 범위**: DL2(본인 모드 재생)의 삭제 버튼 → 확인 → 실제 삭제 + 스토리지 정리 + 데일리 로그 상태 재계산 → 미완성 전환 안내
> **선행 작업**: `TASK_08A_데일리로그_상세_재생.md` (DL2 삭제 버튼 진입점)
> **담당**: 손승태 · collaborator 최승원 (Supabase storage / RPC)
> **우선순위**: P0
> **Supabase 테이블**: `logs`, `daily_logs` / Storage 버킷: `logs`
> **기획서 참조**: PDF Preview (6), §3.2

---

## 📐 구현 대상

| ID | 타입 | 화면 / 동작 | 트리거 |
|----|------|------------|--------|
| DL6 | dialog | 로그 삭제 확인 다이얼로그 | DL2의 삭제 버튼 |
| DL7 | db | 로그 삭제 + 날짜 그룹 재계산 | DL6 "삭제" 확정 |
| DL8 | dialog | 미완성 전환 안내 | DL7 결과 status가 INCOMPLETE로 바뀐 경우 |

---

## 🗂️ 핵심 정책 (§3.2)

| 삭제 후 남은 hour_slot 수 | daily_logs.status | 표시 |
|--------------------------|-------------------|------|
| ≥ 3 (서로 다른 시각) | `COMPLETED` | 그대로 유지 (DL8 미노출) |
| < 3 | `INCOMPLETE` | 미완성 전환 안내 (DL8) |
| 0 (그날 로그 전부 삭제) | row 자체 제거 | 프로필 날짜 카드도 사라짐 → 상위 화면 강제 복귀 |

> 추가 정책: 삭제 후에도 **남은 로그가 0개가 아니면** 날짜 카드는 프로필에 유지된다 (사용자 정정).

---

## 🗄️ DB / Storage 조작 흐름

```
[DL6 확인]
   │
   ├─ 1) Storage 객체 삭제   ── supabase.storage.from('logs').remove([video_url])
   ├─ 2) logs row 삭제       ── supabase.from('logs').delete().eq('id', logId)
   ├─ 3) 재계산 RPC 호출      ── supabase.rpc('recalculate_daily_log_for_date', ...)
   └─ 4) UI 갱신
            │
            ├─ 같은 날 다른 로그 남음 + status COMPLETED → DL4 재진입 (다음 인덱스)
            ├─ 같은 날 다른 로그 남음 + status INCOMPLETE → DL8 → 프로필 화면
            └─ 그날 로그 0개 (방금 삭제한 게 마지막) → 즉시 프로필 화면 + 토스트
```

---

## 🗄️ 마이그레이션 — recalculate_daily_log_for_date

현재 `recalculate_daily_log(p_user_id uuid)`는 **오늘 날짜** 기준만 재계산한다(`docs/DB_스키마.md`). 임의 날짜의 로그 삭제를 지원하려면 날짜 파라미터를 받는 변형이 필요하다.

```sql
-- supabase/migrations/20260514000001_recalc_daily_log_for_date.sql

CREATE OR REPLACE FUNCTION public.recalculate_daily_log_for_date(
  p_user_id uuid,
  p_log_date date
)
RETURNS public.daily_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_hours int;
  v_total_logs     int;
  v_row            public.daily_logs;
BEGIN
  -- 해당 날짜의 hour_slot 다양성과 총 로그 수
  SELECT
    COUNT(DISTINCT hour_slot),
    COUNT(*)
  INTO v_distinct_hours, v_total_logs
  FROM public.logs
  WHERE user_id = p_user_id
    AND recorded_at >= (p_log_date::timestamptz)
    AND recorded_at <  ((p_log_date + 1)::timestamptz);

  -- 그날 로그가 하나도 없으면 row 삭제 후 NULL 반환
  IF v_total_logs = 0 THEN
    DELETE FROM public.daily_logs
    WHERE user_id = p_user_id AND log_date = p_log_date;
    RETURN NULL;
  END IF;

  -- UPSERT
  INSERT INTO public.daily_logs (user_id, log_date, status, updated_at)
  VALUES (
    p_user_id,
    p_log_date,
    CASE WHEN v_distinct_hours >= 3 THEN 'COMPLETED' ELSE 'INCOMPLETE' END,
    now()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE
  SET status     = EXCLUDED.status,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_daily_log_for_date(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.recalculate_daily_log_for_date(uuid, date) TO authenticated;
```

### logs DELETE RLS

`docs/DB_스키마.md`는 INSERT/SELECT만 명시. DELETE 정책이 없다면 추가:

```sql
-- 본인 로그만 DELETE 가능
CREATE POLICY "users can delete own logs"
  ON public.logs FOR DELETE
  USING (user_id = auth.uid());
```

> ⚠️ 적용 후 `pnpm db:gen-types` 실행 — RPC 시그니처가 타입에 반영되어야 함.

---

## 📦 useDeleteLog 훅

```typescript
// hooks/useDeleteLog.ts
import { supabase } from '@/lib/supabase';
import { logger } from '@dei/shared';
import type { Database } from '@dei/api';

type DeleteResult =
  | { kind: 'ok-remaining';      remainingStatus: 'COMPLETED' | 'INCOMPLETE'; remainingCount: number }
  | { kind: 'ok-day-empty' }
  | { kind: 'error'; message: string };

interface DeleteArgs {
  logId: string;
  videoUrl: string;
  date: string;        // YYYY-MM-DD
  userId: string;
}

export function useDeleteLog() {
  const [pending, setPending] = useState(false);

  async function deleteLog({ logId, videoUrl, date, userId }: DeleteArgs): Promise<DeleteResult> {
    setPending(true);
    try {
      // 1) Storage 객체 삭제 — 실패해도 logs row 삭제는 진행 (orphan 허용)
      const { error: storageErr } = await supabase.storage
        .from('logs')
        .remove([videoUrl]);
      if (storageErr) {
        logger.captureMessage('log-delete: storage remove failed', 'warning');
        logger.addBreadcrumb({
          category: 'log-delete',
          message: 'storage-remove-failed',
          data: { videoUrl, error: storageErr.message },
        });
      }

      // 2) logs row 삭제
      const { error: deleteErr } = await supabase
        .from('logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

      if (deleteErr) {
        logger.captureException(deleteErr, {
          tags: { feature: 'log-delete', stage: 'row-delete' },
          extra: { logId, userId },
        });
        return { kind: 'error', message: deleteErr.message };
      }

      // 3) 재계산 RPC
      const { data: dailyRow, error: rpcErr } = await supabase.rpc(
        'recalculate_daily_log_for_date',
        { p_user_id: userId, p_log_date: date },
      );

      if (rpcErr) {
        logger.captureException(rpcErr, {
          tags: { feature: 'log-delete', stage: 'recalc' },
          extra: { logId, userId, date },
        });
        return { kind: 'error', message: rpcErr.message };
      }

      // 4) 결과 분기
      if (!dailyRow) {
        // 그날 로그 0개
        return { kind: 'ok-day-empty' };
      }

      // 남은 로그 수 — UI에서 다음 인덱스 계산용으로 다시 카운트
      const { count } = await supabase
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('recorded_at', `${date}T00:00:00`)
        .lte('recorded_at', `${date}T23:59:59.999`);

      return {
        kind: 'ok-remaining',
        remainingStatus: dailyRow.status as 'COMPLETED' | 'INCOMPLETE',
        remainingCount: count ?? 0,
      };
    } finally {
      setPending(false);
    }
  }

  return { deleteLog, pending };
}
```

---

## DL6 · 로그 삭제 확인 다이얼로그

> **컴포넌트**: `components/ui/dialog`의 RNR Dialog 재사용. inline StyleSheet 금지 — NativeWind className 사용.

```tsx
// components/log-detail/DeleteConfirmDialog.tsx
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;         // YYYY-MM-DD
  recordedAt: string;   // ISO
  willBecomeIncomplete: boolean;
  pending: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open, onOpenChange, date, recordedAt, willBecomeIncomplete, pending, onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 로그를 삭제할까요?</DialogTitle>
          <DialogDescription>
            {formatKoreanDate(date)} · {formatTime(recordedAt)} 에 촬영한 로그를 삭제합니다.
            삭제한 영상은 되돌릴 수 없어요.
            {willBecomeIncomplete && (
              '\n\n삭제 후 이 날의 데일리 로그는 미완성 상태가 됩니다.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 justify-end">
          <Button variant="ghost" onPress={() => onOpenChange(false)} disabled={pending}>
            <Text>취소</Text>
          </Button>
          <Button variant="destructive" onPress={onConfirm} disabled={pending} testID="log-delete-confirm">
            <Text className="text-white">{pending ? '삭제 중…' : '삭제'}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> **`willBecomeIncomplete` 산출**: 호출 측에서 현재 logs 배열의 hour_slot 다양성을 보고 미리 계산.
>
> ```ts
> const currentHours = new Set(logs.map(l => l.hour_slot));
> const afterDeleteHours = new Set(
>   logs.filter(l => l.id !== current.id).map(l => l.hour_slot)
> );
> const willBecomeIncomplete =
>   currentHours.size >= 3 && afterDeleteHours.size < 3;
> ```

---

## DL2 ↔ DL6 연결

`TASK_08A`의 `LogDetailSelf`에 다이얼로그 상태를 추가:

```tsx
// components/log-detail/LogDetailSelf.tsx (수정)

const { deleteLog, pending } = useDeleteLog();
const [confirmOpen, setConfirmOpen]   = useState(false);
const [incompleteOpen, setIncompleteOpen] = useState(false);

const willBecomeIncomplete = useMemo(() => {
  if (!current) return false;
  const before = new Set(logs.map(l => l.hour_slot));
  const after  = new Set(logs.filter(l => l.id !== current.id).map(l => l.hour_slot));
  return before.size >= 3 && after.size < 3;
}, [logs, current]);

async function handleConfirmDelete() {
  if (!current) return;
  posthog.capture('log_delete_confirmed', {
    log_id: anonymize(current.id),
    date,
    will_become_incomplete: willBecomeIncomplete,
  });

  const result = await deleteLog({
    logId: current.id,
    videoUrl: current.video_url,
    date,
    userId,
  });

  setConfirmOpen(false);

  if (result.kind === 'error') {
    showToast('삭제에 실패했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  if (result.kind === 'ok-day-empty') {
    showToast('로그를 삭제했어요');
    router.back();   // 그날 로그가 모두 사라짐 → 프로필 화면
    return;
  }

  // 남은 로그 있음
  if (result.remainingStatus === 'INCOMPLETE' && willBecomeIncomplete) {
    setIncompleteOpen(true);     // DL8
  } else {
    showToast('로그를 삭제했어요');
    await refetch();             // logs 재페치 → SequentialPlayer 다음 index로 자동 진행
  }
}
```

---

## DL7 · 로그 삭제 + 재계산

DL7은 별도 화면이 아닌 `useDeleteLog.deleteLog()` 호출 자체다. 상기 훅이 다음 책임을 진다:

1. **Storage 객체 삭제** — orphan 방지. 실패 시 logger warning, 흐름은 진행.
2. **logs row DELETE** — RLS로 본인 로그만 삭제 가능. 실패 시 즉시 에러 반환.
3. **`recalculate_daily_log_for_date` RPC** — 해당 날짜의 status를 재계산. 로그 0개면 `daily_logs` row까지 삭제.
4. **남은 로그 카운트** — 다음 인덱스 계산을 위해 호출 측에 반환.

### 멱등성 / 동시성

- 같은 로그를 두 번 삭제: 두 번째 DELETE는 0 rows affected — 에러 아님, 무시.
- 다른 디바이스에서 동시 삭제: 마지막 RPC 호출 결과가 권위 있음 (UPSERT + ON CONFLICT).
- 사용자가 빠르게 여러 로그 연속 삭제: `pending` 상태로 버튼 disable 처리 (위 다이얼로그의 `disabled={pending}`).

---

## DL8 · 미완성 전환 안내

```tsx
// components/log-detail/IncompleteSwitchDialog.tsx

export function IncompleteSwitchDialog({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 날짜의 데일리 로그가{'\n'}미완성 상태가 되었어요</DialogTitle>
          <DialogDescription>
            남은 로그는 프로필 날짜별 로그에 그대로 남아있어요.{'\n'}
            서로 다른 시간대에 3개 이상 모이면 다시 완성 상태가 됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onPress={onConfirm}>
            <Text>확인</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

DL8 "확인" → `router.back()`로 프로필 화면 복귀.

---

## 📊 PostHog 트래킹

### log_delete_initiated `P1`
```typescript
// 삭제 버튼 탭 (DL6 열기)
posthog.capture('log_delete_initiated', {
  log_id: anonymize(current.id),
  date,
  will_become_incomplete: willBecomeIncomplete,
});
```

### log_delete_confirmed `P0`
```typescript
// DL6 "삭제" 확정 → DL7 시작
posthog.capture('log_delete_confirmed', {
  log_id: anonymize(current.id),
  date,
  will_become_incomplete: willBecomeIncomplete,
});
```

### log_delete_succeeded `P0`
```typescript
// DL7 완료
posthog.capture('log_delete_succeeded', {
  result_kind: result.kind,        // 'ok-remaining' | 'ok-day-empty'
  remaining_status: result.kind === 'ok-remaining' ? result.remainingStatus : null,
  remaining_count:  result.kind === 'ok-remaining' ? result.remainingCount : 0,
});
```

### log_delete_failed `P0`
```typescript
posthog.capture('log_delete_failed', {
  stage: 'storage' | 'row-delete' | 'recalc',
  message,
});
```

### incomplete_switch_shown `P2`
```typescript
// DL8 노출
posthog.capture('incomplete_switch_shown', { date });
```

---

## 🔗 화면 전환 플로우

```
DL2 (본인 모드 재생)
    │
    └─ [삭제] 버튼 탭
         │
         └─ DL6 (확인 다이얼로그)
              │
              ├─ [취소] ─────────────────────────→ DL2 복귀
              └─ [삭제] ─→ DL7 (storage + row delete + RPC)
                              │
                              ├─ ok-day-empty ───→ 토스트 + 프로필 화면
                              ├─ ok-remaining + COMPLETED 유지 ──→ 토스트 + DL4 다음 로그
                              └─ ok-remaining + INCOMPLETE 전환 ──→ DL8 → 프로필 화면
```

---

## 📁 파일 구조 (08A에 추가)

```
apps/mobile/
  components/
    log-detail/
      DeleteConfirmDialog.tsx          ← DL6
      IncompleteSwitchDialog.tsx       ← DL8
  hooks/
    useDeleteLog.ts                    ← DL7 로직
supabase/
  migrations/
    20260514000001_recalc_daily_log_for_date.sql
    20260514000002_logs_delete_rls.sql  (필요 시 분리)
```

---

## ⚙️ 구현 시 주의사항

1. **Storage 실패는 비치명**: storage `remove` 실패 시에도 row DELETE는 진행 (orphan 영상은 별도 배치로 정리). 사용자 체감 흐름이 storage 장애로 막히면 안 됨.
2. **RPC 시그니처 변경 = 타입 재생성**: 마이그레이션 적용 직후 반드시 `pnpm db:gen-types`. 누락 시 RPC 호출이 unknown 타입으로 떨어진다.
3. **`willBecomeIncomplete` 사전 계산**: 다이얼로그 문구를 사전에 보여주려면 클라이언트에서 한 번 더 계산 필요. 서버 재계산 결과와 미세하게 다를 수 있어 최종 분기는 서버 결과 기준.
4. **삭제 후 인덱스 처리**: `useLogDetail`에서 `logs`를 refetch하면 `current` 자동 갱신. 마지막 인덱스에서 삭제 시: 새 배열 길이로 `index` clamp.
5. **삭제 중 중복 탭 방지**: `pending` 상태로 dialog 버튼 disable. dialog open 자체도 `pending` 동안 close 차단.
6. **logger 적용**: storage 실패 = `captureMessage('warning')`, row delete / RPC 실패 = `captureException` (tags: `feature: 'log-delete'`).
7. **§3.2 정책 단일 소스**: `recalculate_daily_log_for_date` 안에 hour_slot 다양성 규칙(`>= 3`) 명시. 클라이언트의 `willBecomeIncomplete`는 UX 사전 안내용일 뿐, 권위 있는 status는 RPC가 결정.
8. **DELETE RLS 확인**: 기존 정책에 DELETE가 없다면 위 마이그레이션에 포함. 미적용 상태에서 호출 시 0 rows affected로 조용히 실패하니 주의.

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 마이그레이션 `recalculate_daily_log_for_date` + (필요 시) DELETE RLS 적용
- [ ] `pnpm db:gen-types` 후 RPC 시그니처가 `database.types.ts`에 반영
- [ ] DL2 삭제 버튼 → DL6 다이얼로그 정상 노출
- [ ] DL6: `willBecomeIncomplete = true`일 때만 "미완성 상태가 됨" 문구 추가 노출
- [ ] DL7: storage remove 실패해도 row delete + RPC 진행 (logger warning 기록)
- [ ] DL7 결과 분기 동작:
  - [ ] `ok-day-empty` → 토스트 + 프로필 화면 복귀
  - [ ] `ok-remaining` + COMPLETED 유지 → 토스트 + 다음 로그로 자동 진행
  - [ ] `ok-remaining` + INCOMPLETE 전환 → DL8 노출 → 확인 시 프로필 복귀
- [ ] 삭제 중 다이얼로그 버튼 disable (`pending` 상태)
- [ ] 다른 사용자 로그 삭제 시도 시 RLS로 차단 (수동 확인)
- [ ] PostHog 5종 이벤트 연동 (`log_delete_initiated`, `log_delete_confirmed`, `log_delete_succeeded`, `log_delete_failed`, `incomplete_switch_shown`)
- [ ] Vitest 단위 테스트:
  - [ ] `useDeleteLog` — storage 실패 시 row delete 진행 / row delete 실패 시 RPC 미호출 / 0개 남은 경우 `ok-day-empty` 반환
- [ ] Integration 테스트(로컬 supabase): 다른 hour_slot 3개 → 1개 삭제 시 status가 `COMPLETED` 유지, 그 후 2번째 삭제 시 `INCOMPLETE` 전환, 전부 삭제 시 daily_logs row 제거
- [ ] Maestro E2E 1건: 본인 프로필 → 날짜 카드 → DL2 → 삭제 → 토스트 확인

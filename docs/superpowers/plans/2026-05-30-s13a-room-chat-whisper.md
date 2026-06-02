# S13a 방 내부 단체채팅 + @귓속말 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매칭된 영상 방 안에서 동작하는 단일 채팅 화면(S13a) — 전체 단체채팅 기본 + `@`로 특정 멤버 1:1 비밀 귓속말 — 을 풀스택(화면·@자동완성·send Edge/RPC·realtime 수신·멘션 푸시·실DB e2e)으로 구현한다.

**Architecture:** DS 선행(@dei/ui 4종) → 백엔드 계약(멱등 마이그레이션 + `send_room_message` RPC + zod SSOT + `send-message` Edge Function) → 화면(낙관·멱등 송신) → realtime 수신(dedup·자동스크롤/badge) → 멘션 푸시 → 배포 산출물 + 실DB e2e(앱 동일 `functions.invoke` 경로). 귓속말 비밀성은 기존 RLS `message_select_member`가 `postgres_changes` broadcast에 구독자 JWT로 적용되어 보장되며(전제: 소켓에 live-session JWT), F3 음성단언 e2e로 검증한다.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / NativeWind 4 / @dei/ui DS / @supabase/supabase-js 2 / Supabase Edge Functions(Deno) / Vitest(unit·contract·integration) / Jest+RNTL(component) / expo-notifications.

> 설계 SSOT: `docs/superpowers/specs/2026-05-30-s13a-room-chat-whisper-design.md`
> 확정 결정: 글자수=code point / 나간멤버 귓속말 차단 / 방종료 읽기전용 후 30일 purge / 실시간 삭제 다음진입 반영.

---

## 파일 구조 (생성/수정 맵)

**DS (@dei/ui):**
- Create `packages/ui/src/patterns/MentionAutocomplete.tsx` + `__tests__/MentionAutocomplete.test.tsx`
- Create `packages/ui/src/primitives/NewMessageJumpButton.tsx` + `__tests__/NewMessageJumpButton.test.tsx`
- Modify `packages/ui/src/patterns/InputBar.tsx` (whisper-mode 확장) + `__tests__/InputBar.test.tsx`
- Modify `packages/ui/src/patterns/ChatBubble.tsx` (sendState 확장) + `__tests__/ChatBubble.test.tsx`
- Modify `packages/ui/src/patterns/index.ts`, `packages/ui/src/primitives/index.ts` (배럴)

**백엔드:**
- Create `supabase/migrations/<ts>_rooms_v2_message_dedup_push.sql`
- Create `packages/api/src/schemas/sendMessage.ts` + `packages/api/src/__tests__/sendMessage.contract.test.ts`
- Create `supabase/functions/send-message/index.ts`
- Modify `supabase/config.toml` (`[functions.send-message]`)
- Modify `packages/api/src/database.types.ts` (gen-types 산출)

**화면 + 클라 로직:**
- Create `apps/mobile/lib/chat/message-merge.ts` + `__tests__/message-merge.test.ts` (낙관 머지/dedup/정렬 순수로직)
- Create `apps/mobile/lib/chat/length.ts` + `__tests__/length.test.ts` (code point 길이 게이트)
- Create `apps/mobile/lib/chat/mention.ts` + `__tests__/mention.test.ts` (@파싱·후보필터 순수로직)
- Create `apps/mobile/lib/chat/send-message.ts` (functions.invoke + RPC 폴백 글루)
- Create `apps/mobile/hooks/useRoomChat.ts` (스트림·송신·구독 통합 훅)
- Rewrite `apps/mobile/app/(app)/room/[roomId]/chat.tsx` (화면)
- Create `apps/mobile/components/chat/__tests__/RoomChatScreen.test.tsx` (component)

**Realtime + 푸시:**
- Modify `apps/mobile/lib/realtime.ts` (구독 헬퍼는 그대로 사용 — 변경 없을 수도 있음; dedup은 훅에서)
- Rewrite `apps/mobile/lib/notifications.ts` (registerPushToken)

**실DB e2e:**
- Create `scripts/e2e-s13a-realdb.mjs`

---

## Phase 1 — DS 선행 (@dei/ui)

> 화면 코드 작성 전에 전부 @dei/ui에 들어가야 raw 스타일 위반 없음. 각 컴포넌트는 Jest+RNTL.
> 테스트 실행: `pnpm -F @dei/ui test <파일>` (jest-expo). 전체: `pnpm -F @dei/ui test`.

### Task 1: MentionAutocomplete (신규 pattern)

**Files:**
- Create: `packages/ui/src/patterns/MentionAutocomplete.tsx`
- Test: `packages/ui/src/patterns/__tests__/MentionAutocomplete.test.tsx`
- Modify: `packages/ui/src/patterns/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/src/patterns/__tests__/MentionAutocomplete.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { MentionAutocomplete, type MentionCandidate } from '../MentionAutocomplete';

const CANDIDATES: MentionCandidate[] = [
  { userId: 'u1', name: '수아', avatarInitial: '수' },
  { userId: 'u2', name: '민준', avatarInitial: '민' },
];

describe('MentionAutocomplete (X10)', () => {
  it('renders one row per candidate with name', () => {
    render(<MentionAutocomplete candidates={CANDIDATES} onSelect={jest.fn()} />);
    expect(screen.getByText('수아')).toBeTruthy();
    expect(screen.getByText('민준')).toBeTruthy();
  });

  it('onSelect fires with the tapped candidate', () => {
    const onSelect = jest.fn();
    render(<MentionAutocomplete candidates={CANDIDATES} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('mention-row-u2'));
    expect(onSelect).toHaveBeenCalledWith(CANDIDATES[1]);
  });

  it('renders muted empty row when no candidates and emptyLabel given', () => {
    render(<MentionAutocomplete candidates={[]} onSelect={jest.fn()} emptyLabel="보낼 수 있는 멤버가 없어요" />);
    expect(screen.getByText('보낼 수 있는 멤버가 없어요')).toBeTruthy();
  });

  it('returns null when empty and no emptyLabel', () => {
    const { toJSON } = render(<MentionAutocomplete candidates={[]} onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when visible=false', () => {
    const { toJSON } = render(
      <MentionAutocomplete candidates={CANDIDATES} onSelect={jest.fn()} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @dei/ui test MentionAutocomplete`
Expected: FAIL — cannot find module `../MentionAutocomplete`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/ui/src/patterns/MentionAutocomplete.tsx
import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { Avatar } from '../primitives/Avatar';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';
import { shadow } from '../tokens/shadow';

/**
 * MentionAutocomplete (X10) — @자동완성 후보 패널.
 *
 * InputBar 바로 위에 뜨는 floating 후보 리스트. caller가 self/blocked/left를
 * 사전 제외해 candidates로 넘긴다(DS는 표시+선택만). Select(트리거 전용)·
 * Popover(고정위치·label-only)와 다른 책임이라 신규 pattern.
 *
 * 색·치수는 토큰 className만(D-04). shadow는 RN style로(토큰 shadow.pop.rn).
 */
export interface MentionCandidate {
  userId: string;
  name: string;
  avatarInitial?: string;
  /** peer 식별 bg className(§3A). 예: 'bg-[#7A8DB8]'. */
  avatarBg?: string;
}

export interface MentionAutocompleteProps extends Omit<ViewProps, 'children'> {
  candidates: MentionCandidate[];
  onSelect: (c: MentionCandidate) => void;
  /** false면 렌더 안 함. 기본 true. */
  visible?: boolean;
  /** 후보 0명일 때 표시할 muted 라벨. 없으면 null 반환. */
  emptyLabel?: string;
  className?: string;
}

// 패널: paper 표면 + 상단 라운드 + 상단 라인 + pop 그림자(시트 위에 떠 보이게).
const PANEL_CLASS = 'overflow-hidden rounded-t-md border-t border-line bg-paper';

export function MentionAutocomplete({
  candidates,
  onSelect,
  visible = true,
  emptyLabel,
  className,
  ...rest
}: MentionAutocompleteProps) {
  if (!visible) return null;
  if (candidates.length === 0) {
    if (emptyLabel == null) return null;
    return (
      <View className={cn(PANEL_CLASS, className)} style={shadow.pop.rn} {...rest}>
        <Text variant="caption" tone="ink-3" className="px-[14px] py-[12px]">
          {emptyLabel}
        </Text>
      </View>
    );
  }
  return (
    <View className={cn(PANEL_CLASS, className)} style={shadow.pop.rn} {...rest}>
      {candidates.map((c) => (
        <Pressable
          key={c.userId}
          testID={`mention-row-${c.userId}`}
          accessibilityRole="button"
          onPress={() => onSelect(c)}
          className="flex-row items-center gap-[8px] px-[14px] py-[8px] active:bg-bg-2"
        >
          <Avatar initial={c.avatarInitial} size={28} bg={c.avatarBg} />
          <Text className="text-[13px] text-ink">{c.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

MentionAutocomplete.displayName = 'MentionAutocomplete';
```

- [ ] **Step 4: Add barrel export**

In `packages/ui/src/patterns/index.ts`, add after the `InputBar` export block:

```ts
export { MentionAutocomplete } from './MentionAutocomplete';
export type { MentionAutocompleteProps, MentionCandidate } from './MentionAutocomplete';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F @dei/ui test MentionAutocomplete`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/patterns/MentionAutocomplete.tsx packages/ui/src/patterns/__tests__/MentionAutocomplete.test.tsx packages/ui/src/patterns/index.ts
git commit -m "feat(ui): MentionAutocomplete — @자동완성 후보 패널 (X10)"
```

---

### Task 2: NewMessageJumpButton (신규 primitive)

**Files:**
- Create: `packages/ui/src/primitives/NewMessageJumpButton.tsx`
- Test: `packages/ui/src/primitives/__tests__/NewMessageJumpButton.test.tsx`
- Modify: `packages/ui/src/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/src/primitives/__tests__/NewMessageJumpButton.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { NewMessageJumpButton } from '../NewMessageJumpButton';

describe('NewMessageJumpButton', () => {
  it('renders "↓ N개 새 메시지" when count > 0', () => {
    render(<NewMessageJumpButton count={3} onPress={jest.fn()} />);
    expect(screen.getByText('↓ 3개 새 메시지')).toBeTruthy();
  });

  it('onPress fires when tapped', () => {
    const onPress = jest.fn();
    render(<NewMessageJumpButton count={1} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('new-message-jump'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('returns null when count <= 0', () => {
    const { toJSON } = render(<NewMessageJumpButton count={0} onPress={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when visible=false', () => {
    const { toJSON } = render(
      <NewMessageJumpButton count={5} onPress={jest.fn()} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @dei/ui test NewMessageJumpButton`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/ui/src/primitives/NewMessageJumpButton.tsx
import * as React from 'react';
import { Pressable } from 'react-native';
import { ArrowDown } from 'lucide-react-native';

import { Text } from './Text';
import { cn } from '../lib/cn';
import { shadow } from '../tokens/shadow';

/**
 * NewMessageJumpButton — 스크롤이 위에 있을 때 하단에 뜨는 '↓ N개 새 메시지' pill.
 * Badge(순수 표시)와 달리 탭(scroll-to-bottom)+floating 레이아웃을 소유 → 신규.
 * count<=0 또는 visible=false면 렌더 안 함. 색·치수 토큰 className만(D-04).
 */
export interface NewMessageJumpButtonProps {
  count: number;
  onPress: () => void;
  visible?: boolean;
  className?: string;
}

export function NewMessageJumpButton({
  count,
  onPress,
  visible = true,
  className,
}: NewMessageJumpButtonProps) {
  if (!visible || count <= 0) return null;
  return (
    <Pressable
      testID="new-message-jump"
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-[6px] self-center rounded-full bg-accent px-[14px] py-[8px]',
        className,
      )}
      style={shadow.pop.rn}
    >
      <ArrowDown size={14} color="#FFFFFF" />
      <Text className="text-[12px] font-semibold text-white">{`↓ ${count}개 새 메시지`}</Text>
    </Pressable>
  );
}

NewMessageJumpButton.displayName = 'NewMessageJumpButton';
```

> 주: `color="#FFFFFF"`는 lucide 글리프 prop(아이콘 자체엔 className 색 적용 불가) — InputBar의 ArrowUp 글리프도 동일 패턴(white). 텍스트는 토큰 `text-white`.

- [ ] **Step 4: Add barrel export**

In `packages/ui/src/primitives/index.ts`, add (near other primitive exports):

```ts
export { NewMessageJumpButton } from './NewMessageJumpButton';
export type { NewMessageJumpButtonProps } from './NewMessageJumpButton';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F @dei/ui test NewMessageJumpButton`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/NewMessageJumpButton.tsx packages/ui/src/primitives/__tests__/NewMessageJumpButton.test.tsx packages/ui/src/primitives/index.ts
git commit -m "feat(ui): NewMessageJumpButton — 새 메시지 점프 pill"
```

---

### Task 3: InputBar whisper-mode 확장

**Files:**
- Modify: `packages/ui/src/patterns/InputBar.tsx`
- Modify (append): `packages/ui/src/patterns/__tests__/InputBar.test.tsx`

> 핵심 제약: `whisperTarget == null`이면 기존 동작 **byte-identical**(기존 테스트 전부 통과 유지).

- [ ] **Step 1: Write the failing test (append to existing file)**

Append these `it` blocks inside the existing `describe('InputBar (X9)', () => { ... })`:

```tsx
  it('whisper mode: renders removable target chip header and accent placeholder', () => {
    render(
      <InputBar whisperTarget={{ name: '수아', avatarInitial: '수' }} onClearWhisper={jest.fn()} />,
    );
    expect(screen.getByTestId('input-bar-whisper-chip')).toBeTruthy();
    expect(screen.getByText('수아')).toBeTruthy();
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.placeholder).toBe('수아에게만 보이는 귓속말…');
  });

  it('whisper mode: onClearWhisper fires when chip × pressed', () => {
    const onClearWhisper = jest.fn();
    render(<InputBar whisperTarget={{ name: '수아' }} onClearWhisper={onClearWhisper} />);
    fireEvent.press(screen.getByTestId('input-bar-whisper-clear'));
    expect(onClearWhisper).toHaveBeenCalledTimes(1);
  });

  it('whisperTarget=null keeps default placeholder (regression)', () => {
    render(<InputBar />);
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.placeholder).toBe('메시지 입력 (@로 귓속말)');
    expect(screen.queryByTestId('input-bar-whisper-chip')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @dei/ui test InputBar`
Expected: FAIL — `whisperTarget`/`onClearWhisper` not a prop; chip testIDs missing.

- [ ] **Step 3: Modify implementation**

In `packages/ui/src/patterns/InputBar.tsx`:

(a) Add to `InputBarProps` interface (after `inputRef`):

```ts
  /** 귓속말 대상. null이면 일반 전체채팅 모드(기존 동작 유지). */
  whisperTarget?: { name: string; avatarInitial?: string; avatarBg?: string } | null;
  /** 귓속말 대상 칩 × 탭 — 귓속말 모드 해제. */
  onClearWhisper?: () => void;
```

(b) Add imports at top:

```ts
import { Chip } from '../primitives/Chip';
```

(c) Destructure the new props in the function signature (add `whisperTarget = null, onClearWhisper,`).

(d) Compute placeholder + bar tone, and render the chip header. Replace the outer `return (<View ...>` body so the whisper chip sits ABOVE the input row. The container becomes a column when whisper is active:

```tsx
  const whisperActive = whisperTarget != null;
  const effectivePlaceholder = whisperActive
    ? `${whisperTarget.name}에게만 보이는 귓속말…`
    : placeholder;

  return (
    <View
      ref={ref}
      className={cn(
        'border-t border-line bg-paper px-[14px] pt-[10px] pb-[14px]',
        whisperActive && 'border-accent bg-accent-soft',
        className,
      )}
      {...rest}
    >
      {whisperActive ? (
        <View testID="input-bar-whisper-chip" className="mb-[8px] flex-row">
          <Chip
            variant="default"
            label={whisperTarget.name}
            avatar={<Avatar initial={whisperTarget.avatarInitial} size={20} bg={whisperTarget.avatarBg} />}
            removable
            onRemove={onClearWhisper}
            testID="input-bar-whisper-clear-wrap"
          />
          {/* Chip × is the removable button; expose a stable testID via onRemove path */}
        </View>
      ) : null}

      <View className="flex-row items-center gap-[8px]">
        {/* ...existing input + charcount + children + IconButton send... */}
      </View>
    </View>
  );
```

> NOTE: move the existing `flex-1` input wrapper, `children`, and the send `IconButton` into the inner `<View className="flex-row items-center gap-[8px]">`. The `Input`'s `placeholder` prop must become `effectivePlaceholder`. The Chip's `onRemove` already fires `onClearWhisper`; add `testID="input-bar-whisper-clear"` to the Chip's remove Pressable — if `Chip` does not forward a testID to its × button, wrap `onRemove` so the test can target it: render the Chip with `removable onRemove={onClearWhisper}` and add a sibling hit target is NOT needed; instead pass `testID` through. Verify Chip forwards testID to the × Pressable; if not, add `removeTestID` support to Chip in this same task (minimal: in Chip.tsx give the × `<Pressable>` `testID={removeTestID}`), and pass `removeTestID="input-bar-whisper-clear"`.

- [ ] **Step 4: (conditional) Add removeTestID to Chip if needed**

Inspect `packages/ui/src/primitives/Chip.tsx` × Pressable. If it has no testID prop, add:

```ts
  /** × 제거 버튼 testID(테스트 타겟용). */
  removeTestID?: string;
```
and on the × `<Pressable testID={removeTestID} ...>`. Re-export type unchanged (ChipProps already exported). Add a Chip test asserting `removeTestID` forwards.

- [ ] **Step 5: Run tests to verify they pass (incl. regression)**

Run: `pnpm -F @dei/ui test InputBar`
Expected: PASS — ALL existing tests (renders input/send, controlled value, onSend, sendDisabled opacity-40, accent circle, charcount) + 3 new whisper tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/patterns/InputBar.tsx packages/ui/src/patterns/__tests__/InputBar.test.tsx packages/ui/src/primitives/Chip.tsx packages/ui/src/primitives/__tests__/Chip.test.tsx
git commit -m "feat(ui): InputBar whisper-mode 확장 (대상 칩 + accent 톤 + placeholder)"
```

---

### Task 4: ChatBubble sendState + onRetry 확장

**Files:**
- Modify: `packages/ui/src/patterns/ChatBubble.tsx`
- Modify (append): `packages/ui/src/patterns/__tests__/ChatBubble.test.tsx`

> 제약: `sendState` 기본 `'sent'` → them/me/whisper/mention 기존 렌더 경로 불변(기존 테스트 통과 유지). 송신 상태는 me 변형에서만 의미.
> 주의: Spinner는 size 36|80만 지원(인라인 12px 불가) → 'sending'은 **opacity만**(스피너 없음).

- [ ] **Step 1: Write the failing test (append inside describe)**

```tsx
  it('me + failed: renders tappable retry "!" firing onRetry', () => {
    const onRetry = jest.fn();
    render(
      <ChatBubble testID="cb" variant="me" sendState="failed" onRetry={onRetry}>
        실패한 메시지
      </ChatBubble>,
    );
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('me + sending: bubble row carries reduced opacity', () => {
    render(
      <ChatBubble testID="cb" variant="me" sendState="sending">
        전송 중 메시지
      </ChatBubble>,
    );
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('opacity-60');
  });

  it('them is unaffected by sendState (no retry control)', () => {
    render(
      <ChatBubble testID="cb" variant="them" name="수아" avatarInitial="수" sendState="failed">
        상대 메시지
      </ChatBubble>,
    );
    expect(screen.queryByTestId('chat-bubble-retry')).toBeNull();
  });
```

> Add `fireEvent` to the existing import line: `import { fireEvent, render, screen } from '@testing-library/react-native';`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @dei/ui test ChatBubble`
Expected: FAIL — `sendState`/`onRetry` not props; `chat-bubble-retry` missing.

- [ ] **Step 3: Modify implementation**

In `packages/ui/src/patterns/ChatBubble.tsx`:

(a) Add to `ChatBubbleProps` (after `className`):

```ts
  /** me 변형 한정 송신 상태(클라 낙관). 기본 'sent'. */
  sendState?: 'sending' | 'sent' | 'failed';
  /** failed일 때 '!' 탭 재시도. */
  onRetry?: () => void;
  /** 재시도 접근성 라벨. 기본 '전송 재시도'. */
  retryAccessibilityLabel?: string;
```

(b) Import a glyph + Pressable:

```ts
import { Pressable } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
```

(c) Destructure `sendState = 'sent', onRetry, retryAccessibilityLabel = '전송 재시도',` in the signature.

(d) In the `them/me/whisper` render branch, apply opacity to the row when sending, and render the retry control next to a `me + failed` bubble. The row `cn(...)` gets `sendState === 'sending' && 'opacity-60'`. After the `.bub` `<View>`, when `variant === 'me' && sendState === 'failed'`:

```tsx
        {variant === 'me' && sendState === 'failed' ? (
          <Pressable
            testID="chat-bubble-retry"
            accessibilityRole="button"
            accessibilityLabel={retryAccessibilityLabel}
            onPress={onRetry}
            className="mt-[2px] flex-row items-center gap-[3px] self-end"
          >
            <AlertCircle size={13} color="#E5484D" />
            <Text className="text-[10.5px] font-semibold text-danger">재시도</Text>
          </Pressable>
        ) : null}
```

> `text-danger`/`#E5484D` — confirm `danger` token exists in `packages/ui/src/tokens/color.ts`; if the token is named differently (e.g. `destructive`), use that name for the Text className and the matching hex for the glyph `color`. (Grep `color.ts` for `danger|destructive` before writing.)

- [ ] **Step 4: Run tests to verify they pass (incl. regression)**

Run: `pnpm -F @dei/ui test ChatBubble`
Expected: PASS — existing them/me/whisper/mention tests + 3 new.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/patterns/ChatBubble.tsx packages/ui/src/patterns/__tests__/ChatBubble.test.tsx
git commit -m "feat(ui): ChatBubble sendState(sending/sent/failed) + onRetry (me 한정)"
```

---

### Task 5: 배럴 import 해소 + cn() font-size 감사

**Files:**
- Test: `packages/ui/src/__tests__/exports.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/__tests__/exports.test.ts (Vitest — lib-level, not jest)
import { describe, expect, it } from 'vitest';
import * as UI from '../index';

describe('@dei/ui barrel exports', () => {
  it('exports new S13a components', () => {
    expect(UI.MentionAutocomplete).toBeDefined();
    expect(UI.NewMessageJumpButton).toBeDefined();
  });
});
```

> Confirm where `@dei/ui` Vitest unit tests live. If `@dei/ui` has no Vitest config (only Jest), instead add this assertion to a Jest test file `packages/ui/src/patterns/__tests__/MentionAutocomplete.test.tsx` (import `{ MentionAutocomplete, NewMessageJumpButton } from '../../index'`). Pick the harness the package already uses — check `packages/ui/package.json` test script.

- [ ] **Step 2: Run + verify fail/pass**

Run: `pnpm -F @dei/ui test exports` (or the Jest variant)
Expected: PASS once barrels from Tasks 1-2 are in place.

- [ ] **Step 3: cn() audit (manual)**

Grep the new components for non-standard font-size tokens combined with color in one `cn()`:
Run: `grep -rn "text-md\|text-2xs\|text-display" packages/ui/src/patterns/MentionAutocomplete.tsx packages/ui/src/primitives/NewMessageJumpButton.tsx`
Expected: no matches (we used `text-[12px]`/`text-[13px]` arbitrary sizes — safe). If any appear, confirm it's registered in `packages/ui/src/lib/cn.ts` `extendTailwindMerge` font-size classGroup (per known cn() merge trap), else the size silently drops.

- [ ] **Step 4: typecheck DS**

Run: `pnpm -F @dei/ui exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/__tests__/exports.test.ts
git commit -m "test(ui): S13a 신규 컴포넌트 배럴 export 해소 검증"
```

---

## Phase 2 — 백엔드 계약 (스키마 + RPC + zod + Edge)

### Task 6: 마이그레이션 — client_msg_id + push_token + self-whisper CHECK

**Files:**
- Create: `supabase/migrations/20260530000010_rooms_v2_message_dedup_push.sql`

**DDL 체크리스트 (작성 전 확인):**
- message.client_msg_id — PK=N(id 유지) / NOT_NULL=N(back-compat) / INDEX=Y(partial unique) / FK=N / DEFAULT=N / TYPE=uuid / NAMING=Y(message_*)
- push_token — PK=Y((user_id,token) 복합) / NOT_NULL=Y / INDEX=Y / FK=Y(auth.users cascade) / DEFAULT=Y(updated_at now()) / NAMING=Y
- **PK 설정 확인했습니까? → Y** (message id PK 불변, push_token 복합 PK)

- [ ] **Step 1: Write the migration**

```sql
-- 20260530000010_rooms_v2_message_dedup_push.sql
-- S13a: message 멱등(client_msg_id) + self-whisper belt + push_token(멘션 푸시).
-- A 거버넌스(message 소유). 전부 멱등(if not exists). 적용 후 db:gen-types 필수.

-- 1) message dedup key (낙관/재시도/realtime 에코의 linchpin)
alter table public.message add column if not exists client_msg_id uuid;
create unique index if not exists message_client_dedup_uniq
  on public.message(room_id, user_id, client_msg_id)
  where client_msg_id is not null;

-- 2) self-whisper belt (신규 행만 — 기존 데이터 영향 없음)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_no_self_whisper'
  ) then
    alter table public.message
      add constraint message_no_self_whisper
      check (whisper_to_user_id is null or whisper_to_user_id <> user_id) not valid;
  end if;
end $$;

-- 3) push_token (멘션 푸시 대상 토큰; Edge가 service_role로 읽음)
create table if not exists public.push_token (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists push_token_user_idx on public.push_token(user_id);
alter table public.push_token enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'push_token_all_self') then
    create policy push_token_all_self on public.push_token
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
```

- [ ] **Step 2: Apply locally + verify**

Run: `pnpm db:reset`
Expected: migration applies with no error; `supabase db reset` completes.
Run: `psql "$LOCAL_DB_URL" -c "\d public.message"` (or supabase studio) — confirm `client_msg_id` column + `message_client_dedup_uniq` index + `message_no_self_whisper` constraint exist; `\d public.push_token` shows composite PK.

- [ ] **Step 3: Regenerate types**

Run: `pnpm db:gen-types`
Expected: `packages/api/src/database.types.ts` now includes `client_msg_id` on `message` and a `push_token` table. Diff shows additions only.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260530000010_rooms_v2_message_dedup_push.sql packages/api/src/database.types.ts
git commit -m "feat(db): message.client_msg_id 멱등 + self-whisper CHECK + push_token (S13a)"
```

---

### Task 7: RPC send_room_message (SECURITY DEFINER)

**Files:**
- Create: `supabase/migrations/20260530000020_send_room_message_rpc.sql`

- [ ] **Step 1: Write the RPC migration**

```sql
-- 20260530000020_send_room_message_rpc.sql
-- S13a 메시지 전송 RPC (Edge의 폴백 + 트랜잭션 단일 경로). authenticated grant,
-- 내부 auth.uid()=발신자. 반드시 supabaseAsUser(user JWT)로 호출(service_role 호출 시 auth.uid()=NULL → 거절).
-- 글자수=code point(char_length), 귓속말 가드(self/active/block) 서버 재검증.

create or replace function public.send_room_message(
  p_room_id uuid,
  p_body text,
  p_whisper_to_user_id uuid default null,
  p_client_msg_id uuid default null
) returns public.message
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(p_body);
  v_msg public.message;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.room_is_member(p_room_id, v_uid) then
    raise exception 'not_room_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.room r where r.id = p_room_id and r.status = 'active') then
    raise exception 'room_not_active' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'body_length' using errcode = '22001';
  end if;
  if p_whisper_to_user_id is not null then
    if p_whisper_to_user_id = v_uid then
      raise exception 'invalid_whisper_target:self' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.room_member rm
      where rm.room_id = p_room_id and rm.user_id = p_whisper_to_user_id and rm.status = 'active'
    ) then
      raise exception 'invalid_whisper_target:not_member' using errcode = '22023';
    end if;
    if public.is_blocked_between(v_uid, p_whisper_to_user_id) then
      raise exception 'invalid_whisper_target:blocked' using errcode = '22023';
    end if;
  end if;

  insert into public.message (room_id, user_id, body, whisper_to_user_id, client_msg_id, status)
  values (p_room_id, v_uid, v_body, p_whisper_to_user_id, p_client_msg_id, 'sent')
  on conflict (room_id, user_id, client_msg_id) where client_msg_id is not null
  do nothing
  returning * into v_msg;

  if v_msg.id is null then
    -- 멱등 충돌: 기존 행 반환
    select * into v_msg from public.message
      where room_id = p_room_id and user_id = v_uid and client_msg_id = p_client_msg_id;
  elsif p_whisper_to_user_id is not null then
    insert into public.message_mention (message_id, user_id)
    values (v_msg.id, p_whisper_to_user_id)
    on conflict do nothing;
  end if;

  return v_msg;
end $$;

revoke all on function public.send_room_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.send_room_message(uuid, text, uuid, uuid) to authenticated;
```

- [ ] **Step 2: Apply + verify**

Run: `pnpm db:reset`
Expected: no error; function `send_room_message` exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260530000020_send_room_message_rpc.sql
git commit -m "feat(db): send_room_message RPC (멱등 insert + 귓속말 서버 가드)"
```

---

### Task 8: zod 계약 스키마 (SSOT) + contract test

**Files:**
- Create: `packages/api/src/schemas/sendMessage.ts`
- Create: `packages/api/src/__tests__/sendMessage.contract.test.ts`
- Modify: `packages/api/src/index.ts` (export schema)

- [ ] **Step 1: Write the failing contract test**

```ts
// packages/api/src/__tests__/sendMessage.contract.test.ts
import { describe, expect, it } from 'vitest';
import {
  sendMessageRequestSchema,
  sendMessageResponseSchema,
} from '../schemas/sendMessage';

describe('sendMessage contract', () => {
  it('accepts a valid full-chat request', () => {
    const r = sendMessageRequestSchema.safeParse({
      room_id: '11111111-1111-1111-1111-111111111111',
      body: '안녕하세요',
      client_msg_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.success).toBe(true);
  });

  it('rejects body over 500 code points', () => {
    const r = sendMessageRequestSchema.safeParse({
      room_id: '11111111-1111-1111-1111-111111111111',
      body: 'x'.repeat(501),
      client_msg_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid 200 response shape', () => {
    const r = sendMessageResponseSchema.safeParse({
      ok: true,
      deduped: false,
      message: {
        id: '33333333-3333-3333-3333-333333333333',
        room_id: '11111111-1111-1111-1111-111111111111',
        user_id: '44444444-4444-4444-4444-444444444444',
        body: '안녕',
        whisper_to_user_id: null,
        created_at: '2026-05-30T00:00:00Z',
      },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @dei/api test sendMessage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

```ts
// packages/api/src/schemas/sendMessage.ts
import { z } from 'zod';

/** 글자수 = code point (char_length 와 동일 단위). [...s].length 로 측정. */
function codePointLength(s: string): number {
  return [...s].length;
}

export const sendMessageRequestSchema = z.object({
  room_id: z.string().uuid(),
  body: z
    .string()
    .refine((s) => codePointLength(s.trim()) >= 1, { message: 'body_length' })
    .refine((s) => codePointLength(s.trim()) <= 500, { message: 'body_length' }),
  whisper_to_user_id: z.string().uuid().nullable().optional(),
  client_msg_id: z.string().uuid(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const sendMessageResponseSchema = z.object({
  ok: z.literal(true),
  deduped: z.boolean(),
  message: z.object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    user_id: z.string().uuid(),
    body: z.string(),
    whisper_to_user_id: z.string().uuid().nullable(),
    created_at: z.string(),
  }),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export const SEND_MESSAGE_ERROR = {
  invalid_payload: 400,
  unauthenticated: 401,
  not_room_member: 403,
  room_not_active: 409,
  invalid_whisper_target: 422,
  body_length: 422,
} as const;
export type SendMessageErrorCode = keyof typeof SEND_MESSAGE_ERROR;
```

> Confirm `zod` is a dependency of `packages/api` (it's used elsewhere per CLAUDE.md contract tests). If not, add it: `pnpm -F @dei/api add zod`.

- [ ] **Step 4: Export from index**

In `packages/api/src/index.ts`, add:

```ts
export * from './schemas/sendMessage';
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm -F @dei/api test sendMessage`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/schemas/sendMessage.ts packages/api/src/__tests__/sendMessage.contract.test.ts packages/api/src/index.ts
git commit -m "feat(api): sendMessage zod 계약(SSOT) — code point 길이 + 응답 스키마"
```

---

### Task 9: send-message Edge Function

**Files:**
- Create: `supabase/functions/send-message/index.ts`
- Modify: `supabase/config.toml` (add `[functions.send-message]`)

> 패턴: `_shared/auth.ts`(getAuthenticatedUser → supabaseAsUser) + `_shared/cors.ts`(jsonResponse/errorResponse). RPC는 **supabaseAsUser**로 호출. zod는 Edge에서 직접 재구현(Deno는 packages/api import 불가) — 단, 단위·에러코드는 sendMessage.ts와 동일하게.

- [ ] **Step 1: Write the Edge function**

```ts
// supabase/functions/send-message/index.ts
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

function codePointLength(s: string): number {
  return [...s].length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let auth;
  try {
    auth = await getAuthenticatedUser(req);
  } catch {
    return errorResponse('unauthenticated', 401);
  }
  const { supabaseAsUser } = auth;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('invalid_payload', 400);
  }

  const roomId = payload.room_id;
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const whisperTo = (payload.whisper_to_user_id ?? null) as string | null;
  const clientMsgId = payload.client_msg_id;

  if (typeof roomId !== 'string' || typeof clientMsgId !== 'string') {
    return errorResponse('invalid_payload', 400);
  }
  const len = codePointLength(body);
  if (len < 1 || len > 500) return errorResponse('body_length', 422);

  // RPC는 supabaseAsUser(user JWT)로 — auth.uid()=발신자. 서버 측 재검증은 RPC 내부에서도 수행(이중).
  const { data, error } = await supabaseAsUser.rpc('send_room_message', {
    p_room_id: roomId,
    p_body: body,
    p_whisper_to_user_id: whisperTo,
    p_client_msg_id: clientMsgId,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_room_member')) return errorResponse('not_room_member', 403);
    if (msg.includes('room_not_active')) return errorResponse('room_not_active', 409);
    if (msg.includes('body_length')) return errorResponse('body_length', 422);
    if (msg.startsWith('invalid_whisper_target')) {
      const reason = msg.split(':')[1] ?? 'not_member';
      return errorResponse('invalid_whisper_target', 422, { reason });
    }
    if (msg.includes('authentication required')) return errorResponse('unauthenticated', 401);
    return errorResponse('send_failed', 500, { detail: msg });
  }

  const deduped = false; // RPC ON CONFLICT 시 동일 행 반환 — 멱등이므로 클라는 동일 처리. (필요 시 RPC가 deduped 플래그 반환하도록 확장)
  const message = {
    id: data.id,
    room_id: data.room_id,
    user_id: data.user_id,
    body: data.body,
    whisper_to_user_id: data.whisper_to_user_id,
    created_at: data.created_at,
  };

  // 멘션 푸시 디스패치 (Task 14에서 추가). 지금은 no-op.

  return jsonResponse({ ok: true, deduped, message }, { status: 200 });
});
```

- [ ] **Step 2: Add config.toml block**

Append to `supabase/config.toml`:

```toml
[functions.send-message]
verify_jwt = true
```

> `verify_jwt = true` → 플랫폼 GoTrue가 ES256 JWT를 함수 본문 전에 서버검증(ES256-safe). 그래도 함수 내부 `getAuthenticatedUser`가 user 컨텍스트를 다시 확정.

- [ ] **Step 3: Lint/typecheck Edge locally (best-effort)**

Run: `supabase functions serve send-message --no-verify-jwt` (로컬 기동 확인, Ctrl-C). 또는 deno check가 가능하면 `deno check supabase/functions/send-message/index.ts`.
Expected: 기동/타입 에러 없음. (실제 호출 검증은 Task 16 실DB e2e.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-message/index.ts supabase/config.toml
git commit -m "feat(edge): send-message Edge Function (앱 1차 전송 경로, RPC 위임)"
```

---

### Task 10: Integration test — 실 RLS/RPC 거부 경로

**Files:**
- Create: `apps/mobile/__tests__/integration/send-message-rpc.test.ts`

> 로컬 Supabase 전제(skipIf), CI는 강제. service_role로 테스트 유저 생성 → 각 유저 클라(authenticated)로 RPC 호출해 실 RLS/가드 검증. setup.ts 헬퍼 재사용.

- [ ] **Step 1: Write the test**

```ts
// apps/mobile/__tests__/integration/send-message-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasServiceRoleKey, isSupabaseReachable, makeServiceClient } from './setup';

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

beforeAll(async () => {
  run = (await isSupabaseReachable()) && hasServiceRoleKey();
  if (!run) return;
  admin = makeServiceClient();
  userA = await makeUser('e2e-rpc-a@example.test');
  userB = await makeUser('e2e-rpc-b@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room!.id;
  await admin.from('room_member').insert([
    { room_id: roomId, user_id: userA.id, status: 'active' },
    { room_id: roomId, user_id: userB.id, status: 'active' },
  ]);
});

afterAll(async () => {
  if (!run) return;
  await admin.from('room').delete().eq('id', roomId);
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe.skipIf(!process.env.RUN_INTEGRATION && !process.env.CI)('send_room_message RPC (real RLS)', () => {
  it('member sends a full-chat message → 1 row', async () => {
    const cmid = crypto.randomUUID();
    const { data, error } = await userA.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: '안녕', p_whisper_to_user_id: null, p_client_msg_id: cmid,
    });
    expect(error).toBeNull();
    expect(data?.body).toBe('안녕');
  });

  it('same client_msg_id twice → still 1 row (idempotent)', async () => {
    const cmid = crypto.randomUUID();
    await userA.client.rpc('send_room_message', { p_room_id: roomId, p_body: 'dup', p_whisper_to_user_id: null, p_client_msg_id: cmid });
    await userA.client.rpc('send_room_message', { p_room_id: roomId, p_body: 'dup', p_whisper_to_user_id: null, p_client_msg_id: cmid });
    const { count } = await admin.from('message').select('*', { count: 'exact', head: true })
      .eq('room_id', roomId).eq('user_id', userA.id).eq('client_msg_id', cmid);
    expect(count).toBe(1);
  });

  it('self-whisper rejected', async () => {
    const { error } = await userA.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: 'memo', p_whisper_to_user_id: userA.id, p_client_msg_id: crypto.randomUUID(),
    });
    expect(error?.message).toContain('invalid_whisper_target:self');
  });

  it('non-member cannot send', async () => {
    const outsider = await makeUser('e2e-rpc-out@example.test');
    const { error } = await outsider.client.rpc('send_room_message', {
      p_room_id: roomId, p_body: 'x', p_whisper_to_user_id: null, p_client_msg_id: crypto.randomUUID(),
    });
    expect(error?.message).toContain('not_room_member');
  });
});
```

- [ ] **Step 2: Run (local with docker)**

Run: `pnpm db:start && RUN_INTEGRATION=1 pnpm -F mobile test:integration send-message-rpc`
Expected: PASS (4 tests) — or SKIP if no docker (CI enforces).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/__tests__/integration/send-message-rpc.test.ts
git commit -m "test(integration): send_room_message 실 RLS 거부/멱등 경로"
```

---

## Phase 3 — 클라 순수로직 (Vitest unit)

> 위치 `apps/mobile/lib/chat/` — CLAUDE.md 테스트 계층: lib/ = Vitest. jest는 컴포넌트만.
> 실행: `pnpm -F mobile test <파일>` (vitest, jest.config testPathIgnorePatterns가 lib/ 제외).

### Task 11: length.ts (code point 길이 게이트)

**Files:**
- Create: `apps/mobile/lib/chat/length.ts`
- Test: `apps/mobile/lib/chat/__tests__/length.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/lib/chat/__tests__/length.test.ts
import { describe, expect, it } from 'vitest';
import { messageLength, isSendable, MAX_BODY } from '../length';

describe('chat length (code point)', () => {
  it('counts code points (이모지=2 code points for some)', () => {
    expect(messageLength('안녕')).toBe(2);
    expect(messageLength('a'.repeat(500))).toBe(500);
  });
  it('isSendable true for 1..500 trimmed', () => {
    expect(isSendable('안녕')).toBe(true);
    expect(isSendable('   ')).toBe(false);
    expect(isSendable('')).toBe(false);
    expect(isSendable('x'.repeat(501))).toBe(false);
  });
  it('MAX_BODY is 500', () => {
    expect(MAX_BODY).toBe(500);
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test length`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/chat/length.ts
/** 글자수 = code point (DB char_length, Edge, 클라 동일 단위). */
export const MAX_BODY = 500;
export function messageLength(s: string): number {
  return [...s].length;
}
export function isSendable(s: string): boolean {
  const n = messageLength(s.trim());
  return n >= 1 && n <= MAX_BODY;
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm -F mobile test length`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/chat/length.ts apps/mobile/lib/chat/__tests__/length.test.ts
git commit -m "feat(chat): code point 길이 게이트 (클라/Edge/DB 단위 통일)"
```

---

### Task 12: mention.ts (@파싱 + 후보 필터)

**Files:**
- Create: `apps/mobile/lib/chat/mention.ts`
- Test: `apps/mobile/lib/chat/__tests__/mention.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/lib/chat/__tests__/mention.test.ts
import { describe, expect, it } from 'vitest';
import { parseMentionQuery, filterCandidates, type RoomMemberLite } from '../mention';

const MEMBERS: RoomMemberLite[] = [
  { userId: 'me', name: '나', status: 'active' },
  { userId: 'u1', name: '수아', status: 'active' },
  { userId: 'u2', name: '수민', status: 'active' },
  { userId: 'u3', name: '민준', status: 'left' },
];

describe('mention parsing', () => {
  it('detects @query at caret tail', () => {
    expect(parseMentionQuery('안녕 @수')).toEqual({ active: true, query: '수' });
    expect(parseMentionQuery('안녕하세요')).toEqual({ active: false, query: '' });
    expect(parseMentionQuery('@')).toEqual({ active: true, query: '' });
  });

  it('filters out self, blocked, left; prefix-matches name', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set() });
    expect(out.map((m) => m.userId)).toEqual(['u1', 'u2']); // 수아, 수민; 나(self) 제외, 민준(left) 제외
  });

  it('excludes blocked ids', () => {
    const out = filterCandidates(MEMBERS, '수', { selfId: 'me', blockedIds: new Set(['u1']) });
    expect(out.map((m) => m.userId)).toEqual(['u2']);
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test mention`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/chat/mention.ts
export interface RoomMemberLite {
  userId: string;
  name: string;
  status: 'active' | 'left' | 'auto_kicked';
  avatarInitial?: string;
  avatarBg?: string;
}

/** 입력 끝의 @쿼리를 파싱(공백 없는 마지막 토큰이 @로 시작). */
export function parseMentionQuery(text: string): { active: boolean; query: string } {
  const m = /(?:^|\s)@(\S*)$/.exec(text);
  if (!m) return { active: false, query: '' };
  return { active: true, query: m[1] };
}

/** 후보: active 멤버 중 self/blocked 제외 + 닉네임 prefix 매칭. */
export function filterCandidates(
  members: RoomMemberLite[],
  query: string,
  opts: { selfId: string; blockedIds: Set<string> },
): RoomMemberLite[] {
  const q = query.trim().toLowerCase();
  return members.filter(
    (m) =>
      m.status === 'active' &&
      m.userId !== opts.selfId &&
      !opts.blockedIds.has(m.userId) &&
      (q === '' || m.name.toLowerCase().startsWith(q)),
  );
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm -F mobile test mention`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/chat/mention.ts apps/mobile/lib/chat/__tests__/mention.test.ts
git commit -m "feat(chat): @멘션 파싱 + 후보 필터(self/blocked/left 제외)"
```

---

### Task 13: message-merge.ts (낙관 머지 + dedup + 정렬)

**Files:**
- Create: `apps/mobile/lib/chat/message-merge.ts`
- Test: `apps/mobile/lib/chat/__tests__/message-merge.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/lib/chat/__tests__/message-merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeIncoming, type ChatMessage } from '../message-merge';

const base: ChatMessage = {
  id: 'srv-1', clientMsgId: 'c1', userId: 'me', body: 'hi',
  whisperToUserId: null, createdAt: '2026-05-30T00:00:00Z', sendState: 'sent',
};

describe('mergeIncoming', () => {
  it('reconciles optimistic bubble by clientMsgId (no dup)', () => {
    const optimistic: ChatMessage = { ...base, id: 'tmp-1', sendState: 'sending' };
    const echo: ChatMessage = { ...base, id: 'srv-1', sendState: 'sent' };
    const out = mergeIncoming([optimistic], echo);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('srv-1');
    expect(out[0].sendState).toBe('sent');
  });

  it('dedups by server id when clientMsgId absent', () => {
    const existing: ChatMessage = { ...base, clientMsgId: null };
    const dup: ChatMessage = { ...base, clientMsgId: null };
    expect(mergeIncoming([existing], dup)).toHaveLength(1);
  });

  it('appends a genuinely new message and sorts by createdAt then id', () => {
    const older: ChatMessage = { ...base, id: 'a', clientMsgId: null, createdAt: '2026-05-30T00:00:00Z' };
    const newer: ChatMessage = { ...base, id: 'b', clientMsgId: 'c2', createdAt: '2026-05-30T00:00:01Z' };
    const out = mergeIncoming([older], newer);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test message-merge`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/chat/message-merge.ts
export interface ChatMessage {
  id: string;
  clientMsgId: string | null;
  userId: string;
  body: string;
  whisperToUserId: string | null;
  createdAt: string;
  sendState: 'sending' | 'sent' | 'failed';
}

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

/** 들어온 메시지를 기존 목록에 머지. clientMsgId(우선) 또는 server id로 dedup/reconcile. */
export function mergeIncoming(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = list.findIndex(
    (m) =>
      (incoming.clientMsgId != null && m.clientMsgId === incoming.clientMsgId) ||
      m.id === incoming.id,
  );
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...incoming };
    return sortMessages(next);
  }
  return sortMessages([...list, incoming]);
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm -F mobile test message-merge`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/chat/message-merge.ts apps/mobile/lib/chat/__tests__/message-merge.test.ts
git commit -m "feat(chat): 낙관 머지/dedup/정렬 순수로직 (client_msg_id linchpin)"
```

---

## Phase 4 — 송신 글루 + 화면 + 컴포넌트 테스트

### Task 14: send-message.ts (functions.invoke + RPC 폴백)

**Files:**
- Create: `apps/mobile/lib/chat/send-message.ts`
- Test: `apps/mobile/lib/chat/__tests__/send-message.test.ts`

- [ ] **Step 1: Failing test (mock supabase)**

```ts
// apps/mobile/lib/chat/__tests__/send-message.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc } }));

import { sendRoomMessage } from '../send-message';

beforeEach(() => { invoke.mockReset(); rpc.mockReset(); });

describe('sendRoomMessage', () => {
  it('uses functions.invoke as primary path', async () => {
    invoke.mockResolvedValue({ data: { ok: true, deduped: false, message: { id: 's1' } }, error: null });
    const r = await sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: null, clientMsgId: 'c1' });
    expect(invoke).toHaveBeenCalledWith('send-message', expect.objectContaining({
      body: { room_id: 'r', body: 'hi', whisper_to_user_id: null, client_msg_id: 'c1' },
    }));
    expect(r.message.id).toBe('s1');
  });

  it('falls back to RPC when invoke throws fetch error', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'fetch' } });
    rpc.mockResolvedValue({ data: { id: 's2', room_id: 'r', user_id: 'me', body: 'hi', whisper_to_user_id: null, created_at: 't' }, error: null });
    const r = await sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: null, clientMsgId: 'c1' });
    expect(rpc).toHaveBeenCalledWith('send_room_message', expect.any(Object));
    expect(r.message.id).toBe('s2');
  });

  it('throws a typed error on 422 invalid_whisper_target', async () => {
    invoke.mockResolvedValue({ data: { error: 'invalid_whisper_target', reason: 'blocked' }, error: { message: 'invalid_whisper_target' } });
    await expect(
      sendRoomMessage({ roomId: 'r', body: 'hi', whisperToUserId: 'x', clientMsgId: 'c1' }),
    ).rejects.toMatchObject({ code: 'invalid_whisper_target' });
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test send-message`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/chat/send-message.ts
import { supabase } from '@/lib/supabase';

export interface SendArgs {
  roomId: string;
  body: string;
  whisperToUserId: string | null;
  clientMsgId: string;
}
export interface SentMessage {
  id: string; room_id: string; user_id: string;
  body: string; whisper_to_user_id: string | null; created_at: string;
}
export class SendMessageError extends Error {
  constructor(public code: string, public reason?: string) {
    super(code);
    this.name = 'SendMessageError';
  }
}

function isFetchError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError';
}

export async function sendRoomMessage(args: SendArgs): Promise<{ message: SentMessage; deduped: boolean }> {
  const { data, error } = await supabase.functions.invoke('send-message', {
    body: {
      room_id: args.roomId,
      body: args.body,
      whisper_to_user_id: args.whisperToUserId,
      client_msg_id: args.clientMsgId,
    },
  });

  // 1차: Edge 성공
  if (!error && data?.ok) {
    return { message: data.message as SentMessage, deduped: Boolean(data.deduped) };
  }
  // Edge가 닿았지만 4xx 구조화 에러를 본문에 실어준 경우
  if (data?.error && !isFetchError(error)) {
    throw new SendMessageError(String(data.error), data.reason as string | undefined);
  }
  // 네트워크/relay 실패 → RPC 폴백 (Edge 미배포·일시 장애 흡수)
  if (error && isFetchError(error)) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('send_room_message', {
      p_room_id: args.roomId, p_body: args.body,
      p_whisper_to_user_id: args.whisperToUserId, p_client_msg_id: args.clientMsgId,
    });
    if (rpcErr) {
      const reason = rpcErr.message?.startsWith('invalid_whisper_target')
        ? rpcErr.message.split(':')[1] : undefined;
      throw new SendMessageError(rpcErr.message ?? 'send_failed', reason);
    }
    return { message: rpcData as SentMessage, deduped: false };
  }
  throw new SendMessageError(error?.message ?? 'send_failed');
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm -F mobile test send-message`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/chat/send-message.ts apps/mobile/lib/chat/__tests__/send-message.test.ts
git commit -m "feat(chat): sendRoomMessage 글루 — functions.invoke 1차 + RPC 폴백 + 타입 에러"
```

---

### Task 15: useRoomChat 훅 (스트림·송신·구독)

**Files:**
- Create: `apps/mobile/hooks/useRoomChat.ts`
- Test: `apps/mobile/hooks/__tests__/useRoomChat.test.ts` (Vitest — pure-ish, mock supabase/realtime)

- [ ] **Step 1: Failing test (focused on optimistic + retry + dedup wiring)**

```ts
// apps/mobile/hooks/__tests__/useRoomChat.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react-native';

const sendRoomMessage = vi.fn();
vi.mock('@/lib/chat/send-message', () => ({
  sendRoomMessage: (...a: unknown[]) => sendRoomMessage(...a),
  SendMessageError: class extends Error { constructor(public code: string){ super(code);} },
}));
const subscribeRoomMessages = vi.fn(() => () => {});
vi.mock('@/lib/realtime', () => ({ subscribeRoomMessages: (...a: unknown[]) => subscribeRoomMessages(...a) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) },
}));

import { useRoomChat } from '../useRoomChat';

beforeEach(() => { sendRoomMessage.mockReset(); subscribeRoomMessages.mockClear(); });

describe('useRoomChat', () => {
  it('adds optimistic bubble immediately then reconciles on success', async () => {
    sendRoomMessage.mockResolvedValue({ message: { id: 's1', room_id: 'r', user_id: 'me', body: 'hi', whisper_to_user_id: null, created_at: 't' }, deduped: false });
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.messages.some((m) => m.id === 's1')).toBe(true));
    expect(result.current.messages.find((m) => m.id === 's1')?.sendState).toBe('sent');
  });

  it('marks bubble failed on send error and retry reuses clientMsgId', async () => {
    sendRoomMessage.mockRejectedValueOnce(new Error('send_failed'));
    const { result } = renderHook(() => useRoomChat({ roomId: 'r', selfId: 'me' }));
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.messages.some((m) => m.sendState === 'failed')).toBe(true));
    const failed = result.current.messages.find((m) => m.sendState === 'failed')!;
    sendRoomMessage.mockResolvedValueOnce({ message: { id: 's3', room_id: 'r', user_id: 'me', body: 'hi', whisper_to_user_id: null, created_at: 't' }, deduped: false });
    await act(async () => { await result.current.retry(failed.clientMsgId!); });
    expect(sendRoomMessage).toHaveBeenLastCalledWith(expect.objectContaining({ clientMsgId: failed.clientMsgId }));
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test useRoomChat`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

```ts
// apps/mobile/hooks/useRoomChat.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomMessages } from '@/lib/realtime';
import { sendRoomMessage } from '@/lib/chat/send-message';
import { mergeIncoming, type ChatMessage } from '@/lib/chat/message-merge';

interface Args { roomId: string; selfId: string; }

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    clientMsgId: (row.client_msg_id as string | null) ?? null,
    userId: String(row.user_id),
    body: String(row.body),
    whisperToUserId: (row.whisper_to_user_id as string | null) ?? null,
    createdAt: String(row.created_at),
    sendState: 'sent',
  };
}

export function useRoomChat({ roomId, selfId }: Args) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const pending = useRef<Map<string, { body: string; whisperToUserId: string | null }>>(new Map());

  // 초기 로드 (최근 N개, created_at desc → asc 정렬은 merge가 처리)
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('message').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(50);
      if (!alive) return;
      if (error) { logger.captureException(error, { tags: { feature: 'chat-load', room_id: roomId } }); return; }
      setMessages((data ?? []).map(rowToMessage));
    })();
    return () => { alive = false; };
  }, [roomId]);

  // realtime 수신 — 방어 필터(남의 귓속말 drop) + dedup merge
  useEffect(() => {
    const unsub = subscribeRoomMessages(roomId, (row) => {
      const msg = rowToMessage(row);
      // 방어: 귓속말은 발신자=self 또는 대상=self 일 때만(RLS가 1차 가드, 이건 belt)
      if (msg.whisperToUserId != null && msg.whisperToUserId !== selfId && msg.userId !== selfId) return;
      setMessages((prev) => mergeIncoming(prev, msg));
    });
    return unsub;
  }, [roomId, selfId]);

  const doSend = useCallback(async (clientMsgId: string, body: string, whisperToUserId: string | null) => {
    pending.current.set(clientMsgId, { body, whisperToUserId });
    setMessages((prev) => mergeIncoming(prev, {
      id: `tmp-${clientMsgId}`, clientMsgId, userId: selfId, body,
      whisperToUserId, createdAt: new Date().toISOString(), sendState: 'sending',
    }));
    try {
      const { message } = await sendRoomMessage({ roomId, body, whisperToUserId, clientMsgId });
      setMessages((prev) => mergeIncoming(prev, { ...rowToMessage(message as Record<string, unknown>), clientMsgId }));
      pending.current.delete(clientMsgId);
    } catch (err) {
      logger.captureException(err, { tags: { feature: 'chat-send', room_id: roomId } });
      setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, sendState: 'failed' } : m)));
    }
  }, [roomId, selfId]);

  const send = useCallback((body: string, whisperToUserId: string | null = null) => {
    const clientMsgId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    return doSend(clientMsgId, body, whisperToUserId);
  }, [doSend]);

  const retry = useCallback((clientMsgId: string) => {
    const p = pending.current.get(clientMsgId);
    const existing = messages.find((m) => m.clientMsgId === clientMsgId);
    const body = p?.body ?? existing?.body ?? '';
    const whisperToUserId = p?.whisperToUserId ?? existing?.whisperToUserId ?? null;
    setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, sendState: 'sending' } : m)));
    return doSend(clientMsgId, body, whisperToUserId);
  }, [doSend, messages]);

  return { messages, send, retry };
}
```

> 주: 화면이 의존하는 멤버 목록·차단·미읽음 등은 별도 훅/쿼리(추후)로 분리 가능. 이 훅은 메시지 스트림+송신만 책임.

- [ ] **Step 4: Verify pass**

Run: `pnpm -F mobile test useRoomChat`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useRoomChat.ts apps/mobile/hooks/__tests__/useRoomChat.test.ts
git commit -m "feat(chat): useRoomChat 훅 — 낙관 송신/realtime 수신/재시도(멱등)"
```

---

### Task 16: 화면 — RoomChatScreen rewrite + component test

**Files:**
- Rewrite: `apps/mobile/app/(app)/room/[roomId]/chat.tsx`
- Create: `apps/mobile/components/chat/RoomChatView.tsx` (테스트 가능한 순수 view — props로 데이터 주입)
- Test: `apps/mobile/components/chat/__tests__/RoomChatView.test.tsx` (Jest+RNTL)

> 패턴: route 파일은 훅 배선(useRoomChat + 멤버 쿼리 + analytics) → `RoomChatView`에 props 주입. 테스트는 view를 직접 렌더(supabase mock 불필요).

- [ ] **Step 1: Failing component test**

```tsx
// apps/mobile/components/chat/__tests__/RoomChatView.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RoomChatView } from '../RoomChatView';
import type { ChatMessage } from '@/lib/chat/message-merge';

const MSGS: ChatMessage[] = [
  { id: 's1', clientMsgId: null, userId: 'u1', body: '안녕하세요', whisperToUserId: null, createdAt: 't1', sendState: 'sent' },
  { id: 's2', clientMsgId: 'c2', userId: 'me', body: '반가워요', whisperToUserId: null, createdAt: 't2', sendState: 'failed' },
];
const MEMBERS = [
  { userId: 'u1', name: '수아', status: 'active' as const, avatarInitial: '수' },
  { userId: 'u2', name: '민준', status: 'active' as const, avatarInitial: '민' },
];

function setup(overrides = {}) {
  const props = {
    roomName: '테스트 방', memberCount: 3, selfId: 'me',
    messages: MSGS, members: MEMBERS, input: '', whisperTarget: null,
    onChangeInput: jest.fn(), onSend: jest.fn(), onRetry: jest.fn(),
    onSelectMention: jest.fn(), onClearWhisper: jest.fn(), onAvatarPress: jest.fn(), onClose: jest.fn(),
    newCount: 0, onJump: jest.fn(), visible: true, ...overrides,
  };
  render(<RoomChatView {...props} />);
  return props;
}

describe('RoomChatView', () => {
  it('renders messages (them + me)', () => {
    setup();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('반가워요')).toBeTruthy();
  });

  it('failed me message shows retry firing onRetry with clientMsgId', () => {
    const props = setup();
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(props.onRetry).toHaveBeenCalledWith('c2');
  });

  it('shows mention panel when input ends with @ and a candidate tap fires onSelectMention', () => {
    const props = setup({ input: '@수' });
    fireEvent.press(screen.getByTestId('mention-row-u1'));
    expect(props.onSelectMention).toHaveBeenCalledWith(MEMBERS[0]);
  });

  it('whisper chip shows when whisperTarget set', () => {
    setup({ whisperTarget: { name: '수아', avatarInitial: '수' } });
    expect(screen.getByTestId('input-bar-whisper-chip')).toBeTruthy();
  });

  it('new message jump button visible when newCount>0', () => {
    const props = setup({ newCount: 2 });
    fireEvent.press(screen.getByTestId('new-message-jump'));
    expect(props.onJump).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm -F mobile test RoomChatView`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RoomChatView**

```tsx
// apps/mobile/components/chat/RoomChatView.tsx
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';

import {
  BottomSheet, TopNav, ChatBubble, InputBar, MentionAutocomplete,
  NewMessageJumpButton, Badge, StateView,
  type MentionCandidate,
} from '@dei/ui';
import type { ChatMessage } from '@/lib/chat/message-merge';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { parseMentionQuery, filterCandidates } from '@/lib/chat/mention';
import { isSendable, messageLength, MAX_BODY } from '@/lib/chat/length';

export interface RoomChatViewProps {
  roomName: string;
  memberCount: number;
  selfId: string;
  messages: ChatMessage[];
  members: RoomMemberLite[];
  input: string;
  whisperTarget: { userId: string; name: string; avatarInitial?: string; avatarBg?: string } | null;
  onChangeInput: (t: string) => void;
  onSend: () => void;
  onRetry: (clientMsgId: string) => void;
  onSelectMention: (c: RoomMemberLite) => void;
  onClearWhisper: () => void;
  onAvatarPress: (userId: string) => void;
  onClose: () => void;
  newCount: number;
  onJump: () => void;
  visible: boolean;
  blockedIds?: Set<string>;
  roomEnded?: boolean;
}

export function RoomChatView(props: RoomChatViewProps) {
  const { input, members, selfId, blockedIds = new Set(), whisperTarget } = props;
  const mention = parseMentionQuery(input);
  const candidates: MentionCandidate[] = useMemo(
    () =>
      mention.active && whisperTarget == null
        ? filterCandidates(members, mention.query, { selfId, blockedIds }).map((m) => ({
            userId: m.userId, name: m.name, avatarInitial: m.avatarInitial, avatarBg: m.avatarBg,
          }))
        : [],
    [mention.active, mention.query, members, selfId, blockedIds, whisperTarget],
  );

  const sendable = isSendable(input) && !props.roomEnded;
  const overLimit = messageLength(input) > MAX_BODY;

  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} heightPct={78}>
      <TopNav
        title={props.roomName}
        right={<Badge tone="neutral">{`${props.memberCount}명`}</Badge>}
        onLeftPress={props.onClose}
      />
      {props.messages.length === 0 ? (
        <StateView kind="empty" title="아직 메시지가 없어요" />
      ) : (
        <FlatList
          testID="chat-stream"
          data={[...props.messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const mine = item.userId === selfId;
            const member = members.find((mm) => mm.userId === item.userId);
            const variant = item.whisperToUserId != null ? 'whisper' : mine ? 'me' : 'them';
            return (
              <View className="px-[14px] py-[3px]">
                <ChatBubble
                  variant={variant}
                  name={member?.name}
                  avatarInitial={member?.avatarInitial}
                  avatarBg={member?.avatarBg}
                  sendState={mine ? item.sendState : 'sent'}
                  onRetry={() => item.clientMsgId && props.onRetry(item.clientMsgId)}
                >
                  {item.body}
                </ChatBubble>
              </View>
            );
          }}
        />
      )}

      <View>
        <NewMessageJumpButton count={props.newCount} onPress={props.onJump} />
        <MentionAutocomplete
          candidates={candidates}
          visible={candidates.length > 0}
          onSelect={(c) => props.onSelectMention(members.find((m) => m.userId === c.userId)!)}
        />
        <InputBar
          value={input}
          onChange={props.onChangeInput}
          onSend={props.onSend}
          sendDisabled={!sendable}
          charcount={{ count: messageLength(input), max: MAX_BODY }}
          whisperTarget={whisperTarget}
          onClearWhisper={props.onClearWhisper}
        />
      </View>
    </BottomSheet>
  );
}
```

> Confirm `TopNav` prop names (`title`/`right`/`onLeftPress`) and `Badge` props by reading those files; adjust to actual signatures. `StateView kind="empty"` — confirm `StateViewKind` includes `'empty'`.

- [ ] **Step 4: Verify component test passes**

Run: `pnpm -F mobile test RoomChatView`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the route file**

```tsx
// apps/mobile/app/(app)/room/[roomId]/chat.tsx
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { analytics } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { useRoomChat } from '@/hooks/useRoomChat';
import { RoomChatView } from '@/components/chat/RoomChatView';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { parseMentionQuery } from '@/lib/chat/mention';

export default function RoomChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const [selfId, setSelfId] = useState('');
  const [members, setMembers] = useState<RoomMemberLite[]>([]);
  const [roomName, setRoomName] = useState('');
  const [input, setInput] = useState('');
  const [whisperTarget, setWhisperTarget] =
    useState<{ userId: string; name: string; avatarInitial?: string } | null>(null);

  const { messages, send, retry } = useRoomChat({ roomId: roomId!, selfId });

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) setSelfId(auth.user.id);
      // 멤버 + 닉네임 (room_member ⨝ profile)
      const { data } = await supabase
        .from('room_member')
        .select('user_id, status, profile:profile(nickname)')
        .eq('room_id', roomId!);
      setMembers(
        (data ?? []).map((r: any) => ({
          userId: r.user_id, status: r.status,
          name: r.profile?.nickname ?? '익명',
          avatarInitial: (r.profile?.nickname ?? '익')[0],
        })),
      );
    })();
    analytics.capture?.(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
  }, [roomId]);

  const onSend = () => {
    const target = whisperTarget;
    void send(input, target?.userId ?? null).then(() => {
      if (target) analytics.capture?.(ANALYTICS_EVENTS.whisper_mention_sent, { room_id: roomId });
    });
    setInput('');
    setWhisperTarget(null);
  };

  const onSelectMention = (m: RoomMemberLite) => {
    // @쿼리 토큰을 입력에서 제거하고 귓속말 대상 확정
    setInput((prev) => prev.replace(/(?:^|\s)@\S*$/, '').trimEnd());
    setWhisperTarget({ userId: m.userId, name: m.name, avatarInitial: m.avatarInitial });
  };

  return (
    <RoomChatView
      roomName={roomName || '방'}
      memberCount={members.filter((m) => m.status === 'active').length}
      selfId={selfId}
      messages={messages}
      members={members}
      input={input}
      whisperTarget={whisperTarget}
      onChangeInput={setInput}
      onSend={onSend}
      onRetry={retry}
      onSelectMention={onSelectMention}
      onClearWhisper={() => setWhisperTarget(null)}
      onAvatarPress={(userId) => router.push(`/room/${roomId}/members?focus=${userId}`)}
      onClose={() => router.back()}
      newCount={0}
      onJump={() => {}}
      visible
    />
  );
}
```

> Confirm `analytics` export from `@dei/shared` and its `capture` signature (the taxonomy doc says transport is registered in `lib/posthog.ts`). Adjust the call to the actual API (e.g. `analytics.capture(event, props)` without optional chaining if it's always defined). `newCount`/`onJump` auto-scroll wiring is finished in Task 17.

- [ ] **Step 6: Typecheck + run all mobile tests**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile test`
Expected: PASS; no type errors.

- [ ] **Step 7: ds-enforce (raw 스타일 0)**

Run: `pnpm ds-enforce`
Expected: PASS — no inline style/raw hex/StyleSheet in new files.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/components/chat/RoomChatView.tsx apps/mobile/components/chat/__tests__/RoomChatView.test.tsx "apps/mobile/app/(app)/room/[roomId]/chat.tsx"
git commit -m "feat(chat): S13a 화면 — 단체채팅+@귓속말 view + route 배선"
```

---

## Phase 5 — Realtime 자동스크롤/badge + 멘션 푸시

### Task 17: 자동스크롤 + 새 메시지 badge 배선

**Files:**
- Create: `apps/mobile/lib/chat/scroll.ts` + `__tests__/scroll.test.ts` (스크롤 위치 판정 순수로직)
- Modify: `apps/mobile/components/chat/RoomChatView.tsx` (onScroll 연결), `apps/mobile/app/(app)/room/[roomId]/chat.tsx` (newCount 상태)

- [ ] **Step 1: Failing test (pure logic)**

```ts
// apps/mobile/lib/chat/__tests__/scroll.test.ts
import { describe, expect, it } from 'vitest';
import { isNearBottom } from '../scroll';

describe('isNearBottom (inverted list: offset≈0 is bottom)', () => {
  it('true within threshold', () => {
    expect(isNearBottom(0)).toBe(true);
    expect(isNearBottom(80)).toBe(true);
  });
  it('false beyond threshold', () => {
    expect(isNearBottom(200)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify fail / implement / pass**

```ts
// apps/mobile/lib/chat/scroll.ts
/** inverted FlatList: contentOffset.y ≈ 0 이 하단. 120px 이내면 '하단 근처'. */
export const NEAR_BOTTOM_PX = 120;
export function isNearBottom(offsetY: number): boolean {
  return offsetY <= NEAR_BOTTOM_PX;
}
```

Run: `pnpm -F mobile test scroll` → PASS.

- [ ] **Step 3: Wire newCount in route + onScroll in view**

In `RoomChatView`, add `onScroll?: (offsetY: number) => void` prop and pass to `FlatList` `onScroll={(e) => props.onScroll?.(e.nativeEvent.contentOffset.y)}` with `scrollEventThrottle={16}`, and a `ref` to call `scrollToOffset({offset:0})` on jump. In the route, track `nearBottom` + `newCount`: when `useRoomChat.messages` grows and not near bottom, `newCount++`; on jump, scroll to 0 + reset. (Add a `flatListRef` forwarded from view, or expose an `onJump` that the view handles internally via its own ref.)

- [ ] **Step 4: Component test for jump reset + commit**

Add a `RoomChatView` test: when `onScroll(300)` then a new message arrives the badge appears (drive via `newCount` prop), and pressing jump calls `onJump`. (Already partially covered; assert ref scroll via spy is optional.)

```bash
git add apps/mobile/lib/chat/scroll.ts apps/mobile/lib/chat/__tests__/scroll.test.ts apps/mobile/components/chat/RoomChatView.tsx "apps/mobile/app/(app)/room/[roomId]/chat.tsx"
git commit -m "feat(chat): 새 메시지 자동스크롤 vs 하단 점프 badge 배선"
```

---

### Task 18: 멘션 푸시 — registerPushToken + Edge dispatch

**Files:**
- Rewrite: `apps/mobile/lib/notifications.ts`
- Modify: `supabase/functions/send-message/index.ts` (dispatch block)
- Test: `apps/mobile/lib/__tests__/notifications.test.ts` (Vitest — mock expo + supabase)

- [ ] **Step 1: Failing test for registerPushToken**

```ts
// apps/mobile/lib/__tests__/notifications.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getExpoPushTokenAsync = vi.fn();
const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
vi.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: (...a: unknown[]) => getExpoPushTokenAsync(...a),
  getPermissionsAsync: (...a: unknown[]) => getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => requestPermissionsAsync(...a),
}));
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert }) } }));

import { registerPushToken } from '../notifications';

beforeEach(() => { getExpoPushTokenAsync.mockReset(); upsert.mockClear(); getPermissionsAsync.mockReset(); });

describe('registerPushToken', () => {
  it('upserts token when permission granted', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoTok[xyz]' });
    await registerPushToken('user-1', 'ios');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', token: 'ExpoTok[xyz]', platform: 'ios' }),
      expect.any(Object),
    );
  });

  it('skips upsert when permission denied', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await registerPushToken('user-1', 'ios');
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify fail / implement**

```ts
// apps/mobile/lib/notifications.ts
import * as Notifications from 'expo-notifications';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export async function registerPushToken(userId: string, platform: 'ios' | 'android'): Promise<void> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;
    await supabase.from('push_token').upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
  } catch (err) {
    logger.captureException(err, { tags: { feature: 'push-register' } });
  }
}
```

> Install if missing: `pnpm -F mobile add expo-notifications` (or via `npx expo install expo-notifications`).

- [ ] **Step 3: Add Edge dispatch block**

In `supabase/functions/send-message/index.ts`, replace the `// 멘션 푸시 디스패치` comment with a best-effort block (uses the **admin** `supabase` client from `auth`, since it must read another user's token + settings):

```ts
  // 멘션 푸시 (귓속말만, best-effort — 실패가 send 실패를 만들지 않음)
  if (message.whisper_to_user_id && !data_is_dedup_echo(deduped)) {
    void dispatchWhisperPush(auth.supabase, message).catch(() => {});
  }
```

and add the helper (top-level in the file):

```ts
async function dispatchWhisperPush(admin: any, message: { whisper_to_user_id: string; user_id: string; room_id: string }) {
  const target = message.whisper_to_user_id;
  // 조건: chat_mention + push_enabled
  const { data: setting } = await admin.from('notification_setting').select('chat_mention, push_enabled').eq('user_id', target).maybeSingle();
  if (setting && (setting.chat_mention === false || setting.push_enabled === false)) return;
  // 대상 active 멤버 재확인
  const { data: rm } = await admin.from('room_member').select('status').eq('room_id', message.room_id).eq('user_id', target).maybeSingle();
  if (!rm || rm.status !== 'active') return;
  // 발신자 닉네임
  const { data: sender } = await admin.from('profile').select('nickname').eq('user_id', message.user_id).maybeSingle();
  // 대상 토큰
  const { data: tokens } = await admin.from('push_token').select('token').eq('user_id', target);
  if (!tokens?.length) return;
  // quiet-hours(0~7 KST)는 whisper_mention exempt → 시간 무시하고 발송
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map((t: { token: string }) => ({
      to: t.token, title: sender?.nickname ?? '귓속말', body: '귓속말이 도착했어요',
      data: { roomId: message.room_id, type: 'whisper_mention' },
    }))),
  });
}
function data_is_dedup_echo(deduped: boolean) { return deduped; }
```

> `deduped`는 현재 항상 false(Task 9 주석). 멱등 재전송 시 푸시 중복을 막으려면 RPC가 deduped를 반환하도록 확장하는 것을 후속으로 등재. 본문 미포함(privacy) 유지.

- [ ] **Step 4: Verify mobile test + commit**

Run: `pnpm -F mobile test notifications` → PASS (2 tests).

```bash
git add apps/mobile/lib/notifications.ts apps/mobile/lib/__tests__/notifications.test.ts supabase/functions/send-message/index.ts
git commit -m "feat(chat): 멘션 푸시 — registerPushToken + Edge whisper 디스패치(본문 미포함)"
```

---

## Phase 6 — 배포 산출물 + 실DB e2e (앱 동일 경로)

### Task 19: 배포 산출물 적용 + 검증

**Files:** none (운영 명령)

- [ ] **Step 1: 원격 마이그레이션 적용**

Run: `supabase db push`
Expected: 20260530000010 + 20260530000020 적용. (Edge는 이걸로 배포 안 됨 — 다음 스텝.)

- [ ] **Step 2: Edge Function 배포 (CLAUDE.md 8 — 별도 필수)**

Run: `supabase functions deploy send-message`
Then: `supabase functions list`
Expected: 목록에 `send-message` 존재.

- [ ] **Step 3: Secrets 확인**

Run: `supabase secrets list`
Expected: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` 존재(anon 없으면 auth.ts가 service_role 폴백 → auth.uid()=NULL).
없으면: `supabase secrets set SUPABASE_ANON_KEY=...` (값은 `~/.dei/secrets.env` 참조).

- [ ] **Step 4: gen-types 동기화 확인**

Run: `git status packages/api/src/database.types.ts`
Expected: Task 6에서 이미 커밋됨 (drift 없음). drift 있으면 `pnpm db:gen-types` 재실행 후 커밋.

---

### Task 20: 실DB e2e 스크립트 (F1~F9, 앱 동일 functions.invoke)

**Files:**
- Create: `scripts/e2e-s13a-realdb.mjs`

> 패턴 SSOT: `docs/chat-spec/e2e-realdb-report.md`. 전용 유저 `e2e-room-*@example.test`, 실 발급 JWT(ES256, password grant), `functions.invoke` 경로, try/finally cleanup, BASELINE==AFTER. service_role 우회 금지(F3·F8 무의미해짐).

- [ ] **Step 1: Write the script (핵심 골격)**

```js
// scripts/e2e-s13a-realdb.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('env 누락 (~/.dei/secrets.env source)'); process.exit(2); }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { persistSession: false } });
const PW = 'e2e-pass-1234';
const created = [];
let roomId;
const results = [];
const log = (name, ok, note = '') => { results.push({ name, ok, note }); console.log(`${ok ? '✅' : '❌'} ${name} ${note}`); };

async function mkUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const c = userClient();
  const { error: signErr } = await c.auth.signInWithPassword({ email, password: PW }); // 실 발급 ES256 JWT
  if (signErr) throw signErr;
  return { id: data.user.id, c };
}

async function main() {
  const A = await mkUser('e2e-room-a@example.test');
  const B = await mkUser('e2e-room-b@example.test');
  const C = await mkUser('e2e-room-c@example.test');
  const { data: room } = await admin.from('room').insert({ status: 'active' }).select().single();
  roomId = room.id;
  await admin.from('room_member').insert([A, B, C].map((u) => ({ room_id: roomId, user_id: u.id, status: 'active' })));

  const baseline = (await admin.from('message').select('*', { count: 'exact', head: true }).eq('room_id', roomId)).count ?? 0;

  // F8: 실 ES256 JWT로 functions.invoke가 401 안 남
  const cm1 = crypto.randomUUID();
  const f1 = await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: '전체채팅 안녕', whisper_to_user_id: null, client_msg_id: cm1 } });
  log('F1/F8 전체채팅 send + 토큰', !f1.error && f1.data?.ok, JSON.stringify(f1.error ?? ''));

  // F3★ 귓속말 누수: A→B 귓속말, B 수신 / C 미수신 (realtime 음성단언)
  let bGot = false, cGot = false;
  const chB = B.c.channel(`room:${roomId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` }, (p) => { if (p.new.whisper_to_user_id === B.id) bGot = true; }).subscribe();
  const chC = C.c.channel(`room:${roomId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` }, (p) => { if (p.new.whisper_to_user_id === B.id) cGot = true; }).subscribe();
  await new Promise((r) => setTimeout(r, 1500)); // 구독 안정화
  const cm2 = crypto.randomUUID();
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'B에게만 비밀', whisper_to_user_id: B.id, client_msg_id: cm2 } });
  await new Promise((r) => setTimeout(r, 1500)); // 왕복 대기
  log('F2 realtime 왕복(B 수신)', bGot);
  log('F3★ 귓속말 C 미수신(음성단언)', cGot === false, cGot ? 'LEAK!!' : '');
  // F3 REST belt: C가 그 메시지를 SELECT 못함
  const cSel = await C.c.from('message').select('id').eq('client_msg_id', cm2);
  log('F3 REST C 미가시', (cSel.data?.length ?? 0) === 0);
  await admin.removeChannel(chB); await admin.removeChannel(chC);

  // F6 멱등: 동일 client_msg_id 2회 → 1행
  const cm3 = crypto.randomUUID();
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'dup', whisper_to_user_id: null, client_msg_id: cm3 } });
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'dup', whisper_to_user_id: null, client_msg_id: cm3 } });
  const dupCount = (await admin.from('message').select('*', { count: 'exact', head: true }).eq('client_msg_id', cm3)).count;
  log('F6 멱등 2회→1행', dupCount === 1);

  // F7 길이 경계 (code point)
  const over = await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'x'.repeat(501), whisper_to_user_id: null, client_msg_id: crypto.randomUUID() } });
  log('F7 501자 거부(422)', over.data?.error === 'body_length' || over.error != null);

  // F5 비멤버 거부
  const D = await mkUser('e2e-room-d@example.test');
  const out = await D.c.functions.invoke('send-message', { body: { room_id: roomId, body: 'x', whisper_to_user_id: null, client_msg_id: crypto.randomUUID() } });
  log('F5 비멤버 거부(403)', out.data?.error === 'not_room_member' || out.error != null);

  // F4 차단 숨김: C가 A 차단 후, A의 전체메시지가 C에게 안 보임
  await C.c.from('block').insert({ blocker_user_id: C.id, blocked_user_id: A.id, room_id: roomId });
  const cm4 = crypto.randomUUID();
  await A.c.functions.invoke('send-message', { body: { room_id: roomId, body: '차단후메시지', whisper_to_user_id: null, client_msg_id: cm4 } });
  const cSel2 = await C.c.from('message').select('id').eq('client_msg_id', cm4);
  log('F4 차단 발신자 메시지 C 미가시', (cSel2.data?.length ?? 0) === 0);
}

main()
  .catch((e) => { console.error('FATAL', e); process.exitCode = 1; })
  .finally(async () => {
    if (roomId) await admin.from('room').delete().eq('id', roomId); // cascade로 message/member 정리
    for (const id of created) await admin.auth.admin.deleteUser(id);
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n=== S13a 실DB e2e: ${passed}/${results.length} PASS ===`);
    if (results.length === 0 || passed < results.length) process.exitCode = 1;
  });
```

- [ ] **Step 2: Run against deployed Edge + remote DB**

Run: `source ~/.dei/secrets.env && node scripts/e2e-s13a-realdb.mjs`
Expected: `F1~F8 모두 PASS`, 특히 **F3★ 귓속말 C 미수신**. cleanup 후 BASELINE==AFTER.

- [ ] **Step 3: 게이트 통과 확인 + 커밋**

Run: `pnpm verify`
Expected: ds-enforce → typecheck → unit → component → integration 전부 PASS.

```bash
git add scripts/e2e-s13a-realdb.mjs
git commit -m "test(e2e): S13a 실DB e2e (앱 functions.invoke, F3 귓속말 음성단언, ES256 JWT)"
```

- [ ] **Step 4: 보고**

보고는 "통과율"이 아니라: **"①배포(functions list에 send-message) ②env(anon secret 존재) ③ES256 토큰(실 발급 JWT로 invoke 401 없음) 포함, 앱 동일 functions.invoke 경로로 F1~F8 검증함. F3 귓속말 C 미수신 음성단언 PASS(누수 없음)."** 못 한 항목(APNs 실 단말 전달 등) 명시.

---

## Self-Review

**Spec coverage (설계서 §→task):**
- §3 귓속말 보안 → Task 20 F3 음성단언 + Task 15 방어필터 ✅
- §4 화면 해부/DS 선행 → Task 1-5 (DS) + Task 16 (화면) ✅
- §5 핵심 플로우 (a~f) → Task 14·15·16·17 (전송/낙관/@/자동스크롤/재시도) ✅
- §6 백엔드 계약 → Task 7·8·9 (RPC/zod/Edge) ✅
- §7 스키마 델타 → Task 6 ✅
- §8 realtime 수신 → Task 15·17 ✅
- §9 멘션 푸시 → Task 18 ✅
- §10 엣지케이스 → Task 10(거부) + Task 20(F4-F7) + Task 12(필터) ✅
- §11 배포 산출물 → Task 19 ✅
- §12 검증 전략 → 각 task의 TDD + Task 10·20 ✅
- §13 확정 결정 4건 → code point(Task 8·9·11), 나간멤버 차단(Task 7·12), 방종료 읽기전용(route `roomEnded` prop — RoomChatView에 반영, 추가 배선 필요 시 별 task), 실시간 삭제 다음진입(Task 15 INSERT-only 유지) ✅

> **갭 메모:** 방종료 "읽기전용 + 종료 배너" 풀 UX는 RoomChatView `roomEnded` prop은 두었으나 종료 배너/composer disable 세부는 Task 16에서 최소만. 실행 시 종료 상태 배선이 더 필요하면 Task 16.5로 분리. 미읽음 dot(S13 헤더)은 S13(C 담당) 경계라 이 플랜 범위 밖(설계서 §4 명시).

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리"류 없음. (단 TopNav/Badge/StateView/analytics 정확한 prop 시그니처는 실행 시 해당 파일 확인 지시를 명시 — 추측 금지 가드.)

**Type consistency:** `ChatMessage`(message-merge.ts) 가 useRoomChat·RoomChatView·send-message 전반에서 동일 필드(id/clientMsgId/userId/body/whisperToUserId/createdAt/sendState) 사용. `client_msg_id`(snake, DB/RPC/Edge) ↔ `clientMsgId`(camel, 클라) 변환은 rowToMessage 단일 지점. `send_room_message` 시그니처(p_room_id/p_body/p_whisper_to_user_id/p_client_msg_id)가 RPC(Task7)·Edge(Task9)·send-message.ts(Task14)·e2e(Task20)에서 일치.

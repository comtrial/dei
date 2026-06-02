# S13a 방 내부 채팅 — 전체화면 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S13a 방 내부 단체채팅 + @귓속말 화면을 78% 바텀시트에서 독립 전체화면으로 재구성하고, 키보드 위 고정 컴포저·귓속말 보낸이 아바타 복원·헤더 제목 제거를 반영한다.

**Architecture:** 시각 요소는 전부 `@dei/ui` DS (NativeWind 토큰 className만, raw 스타일 0 — `pnpm ds-enforce`가 `app/**`+`components/**` 강제). 데이터/훅 계약(`useRoomChat`, `RoomChatViewProps`)은 유지하고 view 레이어(`RoomChatView`)와 DS 컴포넌트(`TopNav`, `ChatBubble`)만 변경. 키보드는 RN 내장 `KeyboardAvoidingView`(새 의존성 없음).

**Tech Stack:** React Native 0.81 / Expo SDK 54 / NativeWind 4 / `@dei/ui` DS / Vitest(unit) + Jest+RNTL(component) + Playwright(e2e-web).

**Design SSOT:** `.lazyweb/design-brainstorm/s13a-room-chat-fullscreen-2026-06-02/report.html` (목업 5종). 확정 결정:
1. **전체화면** (바텀시트 셸 제거).
2. **헤더**: 방 제목 제거 → `멤버 N명` + 우측 멤버 아바타 스택 (+ back, more).
3. **귓속말 라벨**: 방향 안내("→ 나에게"/"→ 수아") 제거 → 받은 귓속말=보낸이 아바타+이름+`귓속말` 태그 / 내 귓속말=내 아바타(우측)+`귓속말` 태그.
4. **귓속말 보낸이 아바타 복원** (현재 whisper variant는 아바타 미표시).
5. **키보드**: 컴포저가 키보드 위 고정, 자연스러운 dismiss.

---

## File Structure

| File | 책임 | 변경 |
|---|---|---|
| `packages/ui/src/patterns/TopNav.tsx` | 상단 nav | `subtitle` prop 추가(제목 없이 부제만), 기존 title/leftSlot 유지 |
| `packages/ui/src/primitives/AvatarStack.tsx` | 겹친 아바타 스택 | **신규** primitive |
| `packages/ui/src/patterns/ChatBubble.tsx` | 메시지 버블 | whisper variant 아바타 표시 + `귓속말` 태그 칩 + 방향 접미 제거 |
| `apps/mobile/components/chat/RoomChatView.tsx` | S13a view | BottomSheet→전체화면(SafeArea+KeyboardAvoidingView), 헤더/귓속말 props 조정 |
| `apps/mobile/app/(app)/room/[roomId]/chat.tsx` | route 배선 | whisperTarget name에서 방향 라벨 제거(이미 name만 넘김 — 확인) |
| `apps/mobile/e2e/harness/App.tsx` + `mockChatService.ts` | e2e-web 하네스 | RoomChatView로 재포인트 |
| `apps/mobile/e2e/playwright/specs/s13a-room-chat.spec.ts` | e2e-web spec | **신규** |
| `scripts/verify.mjs` | 로컬 게이트 | e2e-web 스테이지 재추가 |
| `.github/workflows/verify.yml` | CI 게이트 | e2e-web 잡 재추가 |

> 모든 DS 컴포넌트 변경은 기존 variant 테스트(them/me/whisper/mention/sendState, TopNav title/leftSlot 등) 회귀를 깨지 않아야 한다.

---

### Task 1: AvatarStack primitive (겹친 멤버 아바타)

**Files:**
- Create: `packages/ui/src/primitives/AvatarStack.tsx`
- Modify: `packages/ui/src/primitives/index.ts` (배럴 export 추가)
- Test: `packages/ui/src/primitives/__tests__/AvatarStack.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react-native';
import { AvatarStack } from '../AvatarStack';

describe('AvatarStack', () => {
  const items = [
    { userId: 'u1', initial: '수', bg: 'bg-[#7A8DB8]' },
    { userId: 'u2', initial: '민', bg: 'bg-[#7A6CB8]' },
    { userId: 'u3', initial: '지', bg: 'bg-[#A86B8A]' },
    { userId: 'u4', initial: '유', bg: 'bg-[#6BA88A]' },
  ];

  it('renders up to max avatars (default 3) and a +N overflow when exceeded', () => {
    render(<AvatarStack items={items} max={3} />);
    expect(screen.getByText('수')).toBeTruthy();
    expect(screen.getByText('민')).toBeTruthy();
    expect(screen.getByText('지')).toBeTruthy();
    // 4th hidden, overflow pill shows +1
    expect(screen.queryByText('유')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('renders all when count <= max with no overflow pill', () => {
    render(<AvatarStack items={items.slice(0, 2)} max={3} />);
    expect(screen.getByText('수')).toBeTruthy();
    expect(screen.getByText('민')).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @dei/ui exec jest AvatarStack` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```tsx
import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Avatar } from './Avatar';
import { Text } from './Text';
import { cn } from '../lib/cn';

export interface AvatarStackItem {
  userId: string;
  initial?: string;
  bg?: string;
  photoUrl?: string;
}

export interface AvatarStackProps extends Omit<ViewProps, 'children'> {
  items: AvatarStackItem[];
  /** 표시할 최대 아바타 수. 초과분은 +N pill. 기본 3. */
  max?: number;
  /** 아바타 지름(px). 기본 26. */
  size?: number;
  className?: string;
}

/**
 * AvatarStack — 겹쳐 보이는 멤버 아바타 묶음(S13a 헤더 "누가 이 방에 있나").
 * 각 아바타는 paper 보더로 분리(겹침), 초과분은 bg-2 +N pill.
 * 색·치수 토큰 className 만(D-04).
 */
export function AvatarStack({ items, max = 3, size = 26, className, ...rest }: AvatarStackProps) {
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;
  return (
    <View className={cn('flex-row items-center', className)} {...rest}>
      {shown.map((it, i) => (
        <View key={it.userId} className={cn('rounded-full border-2 border-paper', i > 0 && '-ml-[8px]')}>
          <Avatar initial={it.initial} photoUrl={it.photoUrl} size={size} bg={it.bg} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          className="-ml-[8px] items-center justify-center rounded-full border-2 border-paper bg-bg-2"
          style={{ width: size, height: size }}
        >
          <Text className="text-[10px] font-bold text-ink-3">{`+${overflow}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

AvatarStack.displayName = 'AvatarStack';
```

> 주의: `style={{ width, height }}`는 숫자 치수 prop이지 색/StyleSheet가 아니므로 ds-enforce 대상(app/components)이 아닌 `packages/ui` 내부이며 허용된다. 단, NativeWind 임의값으로도 표현 가능하면 `w-[Npx]` 선호 — 여기선 size가 prop이라 동적이므로 style 치수 허용(DS 내부 한정).

- [ ] **Step 4: index.ts 배럴 추가**

```ts
export * from './AvatarStack';
```

- [ ] **Step 5: 통과 확인** — Run: `pnpm --filter @dei/ui exec jest AvatarStack` → PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/primitives/AvatarStack.tsx packages/ui/src/primitives/index.ts packages/ui/src/primitives/__tests__/AvatarStack.test.tsx
git commit -m "feat(ds): AvatarStack — 겹친 멤버 아바타 + N pill (S13a 헤더)"
```

---

### Task 2: TopNav `subtitle` (제목 없이 부제만)

**Files:**
- Modify: `packages/ui/src/patterns/TopNav.tsx`
- Test: `packages/ui/src/patterns/__tests__/TopNav.test.tsx` (케이스 추가)

- [ ] **Step 1: 실패 테스트 추가** (기존 describe 안에)

```tsx
it('renders subtitle without a title (S13a: 멤버 N명 only)', () => {
  render(<TopNav left="back" subtitle="멤버 8명" rightActions={null} />);
  expect(screen.getByText('멤버 8명')).toBeTruthy();
});

it('still renders title when provided (regression)', () => {
  render(<TopNav left="back" title="프로필" />);
  expect(screen.getByText('프로필')).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @dei/ui exec jest TopNav` → FAIL (subtitle 미렌더)

- [ ] **Step 3: 구현** — `TopNavProps`에 `subtitle?: string` 추가, 좌측 그룹에서 title/subtitle 2단 렌더.

`TopNavProps` 인터페이스에 추가:
```tsx
  /** 타이틀 아래(또는 단독) 부제. S13a 처럼 제목 없이 부제만도 가능. */
  subtitle?: string;
```

함수 시그니처 구조분해에 `subtitle,` 추가. 좌측 그룹 JSX를 교체:
```tsx
      {/* 좌측 그룹: 컨트롤 + (타이틀/부제 2단) */}
      <View className="flex-1 flex-row items-center">
        {leftNode}
        {title != null || subtitle != null ? (
          <View className={cn('min-w-0', titleHasLeading && 'ml-[6px]')}>
            {title != null ? (
              <Text tone="ink" numberOfLines={1} className={TITLE_CLASS}>
                {title}
              </Text>
            ) : null}
            {subtitle != null ? (
              <Text tone="ink-3" numberOfLines={1} className="text-[11px] font-semibold">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @dei/ui exec jest TopNav` → PASS (기존 + 신규)

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/patterns/TopNav.tsx packages/ui/src/patterns/__tests__/TopNav.test.tsx
git commit -m "feat(ds): TopNav subtitle — 제목 없이 부제만(S13a 멤버 N명)"
```

---

### Task 3: ChatBubble whisper 아바타 복원 + `귓속말` 태그 + 방향 접미 제거

**Files:**
- Modify: `packages/ui/src/patterns/ChatBubble.tsx`
- Test: `packages/ui/src/patterns/__tests__/ChatBubble.test.tsx` (케이스 추가/수정)

**행동 명세 (확정 디자인):**
- whisper 받은(`mine=false`): 좌측 보낸이 아바타 표시 + 이름 + `귓속말` 태그. (현재: 아바타 없음, 이름 뒤 `→ 귓속말` 접미)
- whisper 내가 보낸(`mine=true`): 우측 내 아바타 표시 + `귓속말` 태그(이름 숨김). (현재: 아바타 없음)
- 방향 접미(` → 귓속말`) 자동 부착 로직 제거 → 대신 이름 라인에 `귓속말` 태그 노드.
- them/me/mention variant는 불변(회귀 유지).

- [ ] **Step 1: 실패/변경 테스트 작성**

```tsx
it('whisper (received) shows sender avatar + name + 귓속말 tag, no 방향 접미', () => {
  render(
    <ChatBubble variant="whisper" name="민준" avatarInitial="민" avatarBg="bg-[#7A6CB8]">
      우리 둘이 따로 보자
    </ChatBubble>,
  );
  expect(screen.getByText('민준')).toBeTruthy();
  expect(screen.getByText('귓속말')).toBeTruthy();
  expect(screen.queryByText(/→ 귓속말/)).toBeNull();
  expect(screen.queryByText(/나에게/)).toBeNull();
  expect(screen.getByText('우리 둘이 따로 보자')).toBeTruthy();
});

it('whisper (mine) shows my avatar on the right and 귓속말 tag, name hidden', () => {
  render(
    <ChatBubble variant="whisper" mine name="나" avatarInitial="나" avatarBg="bg-[#C99A5B]">
      카페 추천해줘요
    </ChatBubble>,
  );
  // 내 귓속말은 이름 숨김(me 처럼), 태그는 노출, 아바타 이니셜 노출
  expect(screen.getByText('귓속말')).toBeTruthy();
  expect(screen.getByText('나')).toBeTruthy(); // 아바타 이니셜
  expect(screen.getByText('카페 추천해줘요')).toBeTruthy();
});

it('whisper (mine) failed shows retry control', () => {
  const onRetry = jest.fn();
  render(
    <ChatBubble variant="whisper" mine avatarInitial="나" sendState="failed" onRetry={onRetry}>
      hi
    </ChatBubble>,
  );
  fireEvent.press(screen.getByTestId('chat-bubble-retry'));
  expect(onRetry).toHaveBeenCalled();
});
```

> 기존 whisper 테스트에 `→ 귓속말` 접미를 검증하던 케이스가 있으면 위 명세로 **교체**한다(접미 제거가 의도된 변경).

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @dei/ui exec jest ChatBubble` → FAIL

- [ ] **Step 3: 구현 변경**

`WHISPER_SUFFIX` 상수 + `displayName` 접미 로직 제거. whisper 아바타 노출 조건 확장 + 태그 노드 추가:

(a) `showAvatar` 조건을 whisper도 포함하도록 변경:
```tsx
  // them: 좌측 아바타. whisper: 받은(좌)/내(우) 양쪽 모두 아바타 표시(보낸이 식별).
  const showAvatar =
    (variant === 'them' || variant === 'whisper') &&
    (avatarInitial != null || avatarPhotoUrl != null);
```

(b) whisper-mine은 아바타가 우측이라 행 순서를 뒤집는다. `WHISPER_MINE_ROW_CLASS`에 `flex-row-reverse` 사용:
```tsx
const WHISPER_MINE_ROW_CLASS = 'flex-row-reverse gap-[8px] max-w-[78%] self-end';
```

(c) `displayName` 계산 제거, whisper 이름 라인을 이름 + 태그로:
```tsx
  // me 또는 내 귓속말(mine)은 이름 숨김. them/받은 whisper만 이름 표시.
  const showName = variant === 'them' || (variant === 'whisper' && !mine);
  // whisper는 항상 '귓속말' 태그를 이름 라인에 노출(내 귓속말은 이름 없이 태그만).
  const showWhisperTag = variant === 'whisper';
```

이름 라인 JSX 교체(`.col` 안):
```tsx
        {showName || showWhisperTag ? (
          <View
            className={cn(
              'mb-[3px] flex-row items-center gap-[5px]',
              variant === 'whisper' && mine && 'self-end',
            )}
          >
            {showName ? (
              <Text
                className={cn(
                  'text-[10.5px] font-semibold',
                  variant === 'whisper' ? 'font-bold text-accent' : 'text-ink-3',
                )}
              >
                {name}
              </Text>
            ) : null}
            {showWhisperTag ? (
              <Text
                testID="chat-bubble-whisper-tag"
                className="overflow-hidden rounded-full bg-accent px-[6px] py-[1px] text-[8.5px] font-extrabold text-white"
              >
                귓속말
              </Text>
            ) : null}
          </View>
        ) : null}
```

> 기존 `showName = variant !== 'me' && name != null` 한 줄과 `displayName` Text 라인은 위 블록으로 대체.

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @dei/ui exec jest ChatBubble` → PASS (them/me/mention 회귀 포함)

- [ ] **Step 5: 전체 DS 컴포넌트 테스트** — Run: `pnpm --filter @dei/ui exec jest` → 전부 PASS (TopNav/AvatarStack/ChatBubble 포함)

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/patterns/ChatBubble.tsx packages/ui/src/patterns/__tests__/ChatBubble.test.tsx
git commit -m "feat(ds): ChatBubble whisper 아바타 복원 + 귓속말 태그, 방향 접미 제거"
```

---

### Task 4: RoomChatView 전체화면 + 키보드 + 헤더/귓속말 반영

**Files:**
- Modify: `apps/mobile/components/chat/RoomChatView.tsx`
- Test: `apps/mobile/components/chat/__tests__/RoomChatView.test.tsx`

**변경 명세:**
- `BottomSheet`/`SheetHandle` 제거 → 루트를 `SafeAreaView`(top/bottom edges) + `flex-1` column.
- 스트림과 컴포저 사이에 `KeyboardAvoidingView`(iOS `padding`, Android `height`)로 컴포저가 키보드 위로.
- 헤더: `TopNav left="back" subtitle="멤버 N명"` + `rightActions={<AvatarStack .../>}` (title 없음).
- 스트림 영역을 `flex-1`로 감싸 컴포저가 항상 하단 고정.
- `whisperTarget.name`은 그대로(귓속말 칩 라벨). 방향 라벨 로직(`→ …에게`) 제거 — ChatBubble이 태그로 대체하므로 view의 `name` 계산에서 방향 분기 삭제.

- [ ] **Step 1: 실패 테스트 작성/수정** (기존 setup 유지, 케이스 추가)

```tsx
it('renders full-screen header with member count subtitle (no room title)', () => {
  setup({ memberCount: 8 });
  expect(screen.getByText('멤버 8명')).toBeTruthy();
});

it('does not show 방향 안내 (→ 나에게 / → …에게) on whisper bubbles', () => {
  const wMsgs = [
    { id: 'w1', clientMsgId: null, userId: 'u1', body: '비밀', whisperToUserId: 'me', createdAt: 't', sendState: 'sent' as const },
  ];
  setup({ messages: wMsgs });
  expect(screen.queryByText(/나에게/)).toBeNull();
  expect(screen.getByText('비밀')).toBeTruthy();
});

it('renders composer above stream (KeyboardAvoidingView present)', () => {
  setup();
  expect(screen.getByTestId('room-chat-kav')).toBeTruthy();
  expect(screen.getByTestId('input-bar-input')).toBeTruthy();
});

it('no longer renders a bottom-sheet scrim/surface', () => {
  setup();
  expect(screen.queryByTestId('bottom-sheet-surface')).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile exec jest RoomChatView` → FAIL

- [ ] **Step 3: 구현** — `RoomChatView.tsx` 교체(전체 구조; 데이터/핸들러 props 계약 불변):

```tsx
import { useCallback, useMemo, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AvatarStack,
  ChatBubble,
  InputBar,
  MentionAutocomplete,
  NewMessageJumpButton,
  StateView,
  TopNav,
  type MentionCandidate,
} from '@dei/ui';
import type { ChatMessage } from '@/lib/chat/message-merge';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { filterCandidates, parseMentionQuery } from '@/lib/chat/mention';
import { renderBodyWithMentions } from '@/lib/chat/renderBody';
import { isSendable, MAX_BODY, messageLength } from '@/lib/chat/length';

// RoomChatViewProps 인터페이스: 기존 그대로 유지(roomName은 미사용이 되지만 계약 보존).
// ... (기존 props 인터페이스 복사 — 변경 없음)

export function RoomChatView(props: RoomChatViewProps) {
  const { input, members, selfId, blockedIds, whisperTarget } = props;
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const handleJump = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    props.onJump();
  }, [props]);

  const candidates: MentionCandidate[] = useMemo(() => {
    const mention = parseMentionQuery(input);
    if (!mention.active) return [];
    return filterCandidates(members, mention.query, {
      selfId,
      blockedIds: blockedIds ?? new Set<string>(),
    }).map((m) => ({ userId: m.userId, name: m.name, avatarInitial: m.avatarInitial, avatarBg: m.avatarBg }));
  }, [input, members, selfId, blockedIds]);

  const sendable = isSendable(input) && !props.roomEnded;

  // 헤더 아바타 스택(active 멤버, self 제외 우선 — 식별용).
  const stackItems = useMemo(
    () =>
      members
        .filter((m) => m.status === 'active' && m.userId !== selfId)
        .map((m) => ({ userId: m.userId, initial: m.avatarInitial, bg: m.avatarBg, photoUrl: m.photoUrl })),
    [members, selfId],
  );

  if (!props.visible) return null;

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg" testID="room-chat-screen">
      <TopNav
        left="back"
        onLeftPress={props.onClose}
        leftAccessibilityLabel="뒤로"
        subtitle={`멤버 ${props.memberCount}명`}
        rightActions={<AvatarStack items={stackItems} max={3} />}
      />

      <KeyboardAvoidingView
        testID="room-chat-kav"
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1">
          {props.messages.length === 0 ? (
            <StateView
              kind="empty"
              icon="💬"
              title="아직 메시지가 없어요"
              desc="첫 메시지를 남겨보세요. @닉네임으로 귓속말도 보낼 수 있어요."
            />
          ) : (
            <FlatList
              ref={listRef}
              testID="chat-stream"
              className="flex-1"
              data={[...props.messages].reverse()}
              inverted
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => props.onScroll?.(e.nativeEvent.contentOffset.y)}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => {
                const mine = item.userId === selfId;
                const member = members.find((mm) => mm.userId === item.userId);
                const isWhisper = item.whisperToUserId != null;
                const variant: 'them' | 'me' | 'whisper' = isWhisper ? 'whisper' : mine ? 'me' : 'them';
                // 방향 안내 제거 — 이름만(받은 귓속말). 내 귓속말/내 메시지는 이름 숨김.
                const name = member?.name;
                return (
                  <View className="px-[14px] py-[3px]">
                    <ChatBubble
                      variant={variant}
                      mine={mine}
                      name={name}
                      avatarInitial={member?.avatarInitial}
                      avatarBg={member?.avatarBg}
                      avatarPhotoUrl={member?.photoUrl}
                      onAvatarPress={() => props.onAvatarPress(item.userId)}
                      sendState={mine ? item.sendState : 'sent'}
                      onRetry={() => {
                        if (item.clientMsgId) props.onRetry(item.clientMsgId);
                      }}
                    >
                      {renderBodyWithMentions(item.body, { variant })}
                    </ChatBubble>
                  </View>
                );
              }}
            />
          )}

          <View>
            <NewMessageJumpButton count={props.newCount} onPress={handleJump} />
            <MentionAutocomplete
              candidates={candidates}
              visible={candidates.length > 0}
              onSelect={(c) => {
                const member = members.find((m) => m.userId === c.userId);
                if (member) props.onSelectMention(member);
              }}
            />
            <InputBar
              value={input}
              onChange={props.onChangeInput}
              onSend={props.onSend}
              sendDisabled={!sendable}
              charcount={{ count: messageLength(input), max: MAX_BODY }}
              whisperTarget={
                whisperTarget
                  ? { name: whisperTarget.name, avatarInitial: whisperTarget.avatarInitial, avatarBg: whisperTarget.avatarBg }
                  : null
              }
              onClearWhisper={props.onClearWhisper}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

RoomChatView.displayName = 'RoomChatView';
```

> `RoomChatViewProps` 인터페이스 블록은 기존 파일 것을 그대로 보존(roomName 포함 — 호출부 계약 유지). 위 본문만 교체.

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile exec jest RoomChatView` → PASS (기존 + 신규)

- [ ] **Step 5: 타입체크** — Run: `pnpm --filter mobile exec tsc --noEmit` → 0 에러

- [ ] **Step 6: ds-enforce** — Run: `pnpm ds-enforce` → 0 위반 (RoomChatView raw 스타일 0 확인)

- [ ] **Step 7: 커밋**

```bash
git add apps/mobile/components/chat/RoomChatView.tsx apps/mobile/components/chat/__tests__/RoomChatView.test.tsx
git commit -m "feat(chat): RoomChatView 전체화면 전환 — KAV 키보드·멤버수 헤더·아바타 스택·방향 안내 제거"
```

---

### Task 5: route(chat.tsx) 방향 라벨 잔재 제거 확인

**Files:**
- Modify: `apps/mobile/app/(app)/room/[roomId]/chat.tsx`

> 현재 route는 view에 `whisperTarget.name`만 넘기고 방향 라벨은 view가 만들었으므로 route 변경은 최소. roomName 강제 공백(`setRoomName('')`)은 헤더에 더 이상 안 쓰이므로 무해하나, 죽은 코드 정리.

- [ ] **Step 1: roomName 관련 죽은 상태 제거** — `roomName` state와 `setRoomName('')`, `RoomChatView`의 `roomName` prop 전달 제거(인터페이스에서 optional로 두거나 제거). 단 `RoomChatViewProps.roomName` 제거 시 테스트 setup도 갱신.

- [ ] **Step 2: 타입체크 + 컴포넌트 테스트** — Run: `pnpm --filter mobile exec tsc --noEmit && pnpm --filter mobile exec jest RoomChatView` → PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/mobile/app/(app)/room/[roomId]/chat.tsx apps/mobile/components/chat/RoomChatView.tsx apps/mobile/components/chat/__tests__/RoomChatView.test.tsx
git commit -m "refactor(chat): roomName 죽은 상태 제거 (헤더 제목 없음)"
```

---

### Task 6: 테스트 시나리오 발굴 (별도 Agent team) → 시나리오 케이스 구현

**목적:** UI뿐 아니라 기능(전송/realtime/귓속말 RLS 가시성/멘션/차단/방종료/키보드) 전반의 정상+엣지 케이스를 빠짐없이 발굴해 테스트로 고정.

**방식:** Workflow(멀티 에이전트)로 차원별 시나리오 발굴 → 중복 제거 → 각 시나리오를 적합 계층(unit/component/e2e-web)에 케이스로 작성 → 통과. (사용자가 명시 요청한 "별도 Agent team".)

**차원(발굴 lens):**
- 멘션 파싱/자동완성(parseMentionQuery, filterCandidates, resolveTailMention): self/blocked/left 제외, prefix-ambiguous, tail strip, 대상 교체.
- 길이 게이트(isSendable, messageLength, MAX_BODY): 공백만, 최대초과, 이모지/조합문자.
- 귓속말 가시성(whisper RLS): 본인·상대만, 제3자 숨김 — integration 계층(실 Supabase, CI 강제).
- 송신 상태(sending/sent/failed) + 재시도(낙관 머지 message-merge).
- 새 메시지 카운트(countNewMessages, isNearBottom): self 제외, 점프 리셋.
- 방 종료 전이(roomEnded): composer disabled, 귓속말 대상 정리, @잔재 strip.
- 키보드: persistTaps, 컴포저 위치(component 레벨 KAV 존재 + e2e-web 포커스 시 가림 없음).

- [ ] **Step 1: 시나리오 매트릭스 산출** — `docs/superpowers/specs/2026-06-02-s13a-test-scenarios.md` (Workflow 산출물). 각 행: `id | 계층 | 입력 | 기대 | 근거`.
- [ ] **Step 2: unit/component 케이스 작성** — 누락 케이스를 `lib/chat/__tests__/*`, `components/chat/__tests__/*`, `packages/ui` 회귀에 추가.
- [ ] **Step 3: integration 케이스** — 귓속말 가시성 RLS를 `apps/mobile/__tests__/integration/`에 추가(로컬 Docker 없으면 skipIf, CI 강제).
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile test && pnpm --filter @dei/ui test` → PASS
- [ ] **Step 5: 커밋** — `test(chat): S13a 정상+엣지 시나리오 케이스(멘션/길이/귓속말/상태/방종료/키보드)`

---

### Task 7: e2e-web 하네스 RoomChatView 재포인트 + spec

**Files:**
- Modify: `apps/mobile/e2e/harness/App.tsx`, `apps/mobile/e2e/harness/mockChatService.ts`
- Create: `apps/mobile/e2e/playwright/specs/s13a-room-chat.spec.ts`
- Modify: `apps/mobile/e2e/playwright/vite.config.ts` (필요 시 alias)

- [ ] **Step 1: 하네스 App을 RoomChatView로** — `?screen=room-chat&scenario=...`로 `RoomChatView`를 직접 마운트(프로덕션 view, props는 시나리오별 fixture). lucide 아이콘 신규 사용 시 `__harness_shims__/lucide` 에 export 추가(아니면 e2e 전부 실패 — 메모리 참조).
- [ ] **Step 2: spec 작성** — 시나리오: ① 전체화면 헤더(멤버 N명·아바타 스택, 시트 scrim 없음) ② them/me/whisper 버블 정렬 ③ 귓속말 아바타+태그 노출, 방향 안내 없음 ④ @입력→자동완성→칩 ⑤ 빈 상태 ⑥ 방 종료 읽기전용 ⑦ 컴포저 포커스 시 입력창 가림 없음(키보드 대체: 포커스 후 입력창 boundingBox가 viewport 안).
- [ ] **Step 3: 로컬 실행** — Run: `pnpm --filter mobile exec playwright test specs/s13a-room-chat.spec.ts` → PASS (`test:e2e:web:install` 선행).
- [ ] **Step 4: 커밋** — `test(e2e-web): S13a 전체화면 채팅 하네스 재구성 + spec`

---

### Task 8: verify 게이트에 e2e-web 재추가

**Files:**
- Modify: `scripts/verify.mjs` (e2e-web 스테이지 재추가 — 현재 "스캐폴딩 단계"로 제외됨)
- Modify: `.github/workflows/verify.yml` (e2e-web 잡 + `chat-verify`/`verify` 집계 needs 체인)

- [ ] **Step 1: verify.mjs** — integration 뒤에 `7/7 e2e-web (Playwright)` 스테이지 추가, `pnpm --filter mobile exec playwright test` 실행 + 0 케이스 시 FAIL.
- [ ] **Step 2: verify.yml** — `e2e-web` 잡(needs: integration), chromium install 캐시, 집계 잡 needs에 추가.
- [ ] **Step 3: 로컬 verify** — Run: `pnpm verify` → ds-enforce/lint/typecheck/unit/component PASS, integration NOT-RUN-LOCALLY(Docker 없음), e2e-web PASS.
- [ ] **Step 4: 커밋** — `ci(verify): e2e-web(Playwright) 게이트 재추가 — S13a 화면 구현 완료`

---

### Task 9: PR 생성 + CI green 확인

- [ ] **Step 1: 푸시** — `git push -u origin feat/s13a-room-chat-whisper`
- [ ] **Step 2: PR 생성** — `gh pr create` (제목/본문: 전체화면 전환·키보드·귓속말 아바타·헤더·테스트/e2e). 본문에 디자인 SSOT 경로 + 검증 결과(앱 경로 e2e 포함 여부 명시).
- [ ] **Step 3: CI 감시** — `gh pr checks --watch` 로 `verify` 집계 체크 green 확인. 실패 시 로그 분석 → 수정 → 재푸시 루프.
- [ ] **Step 4: green 확인 후 종료 보고** — 통과한 게이트/실DB 검증 여부를 근거로 보고. 못 한 항목은 명시.

---

## Self-Review

- **Spec coverage:** ① 전체화면(Task4) ② 키보드 위 고정+dismiss(Task4 KAV + keyboardShouldPersistTaps, Task7 e2e 포커스) ③ 방향 안내 제거(Task3+4) ④ 방 제목 제거→멤버수+스택(Task1,2,4) ⑤ 귓속말 보낸이 아바타(Task3) ⑥ 기능 엣지 케이스 발굴(Task6 agent team) ⑦ e2e(Task7) ⑧ PR+CI green(Task9). 전부 매핑됨.
- **Placeholder scan:** 코드 스텝은 실제 코드 포함. integration RLS 케이스(Task6 Step3)는 발굴 산출 의존이라 구체 코드는 Workflow 결과로 채움 — 단 계층·위치·skipIf 패턴 명시.
- **Type consistency:** `AvatarStackItem{userId,initial,bg,photoUrl}` (Task1) ↔ Task4 `stackItems` 동일 키. `subtitle` prop (Task2) ↔ Task4 사용 일치. ChatBubble `showName/showWhisperTag/mine` (Task3) ↔ Task4 호출 `mine`/`name` 일치. `room-chat-kav` testID (Task4) ↔ Task4 테스트 일치.

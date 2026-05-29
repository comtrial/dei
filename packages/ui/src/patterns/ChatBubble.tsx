import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Avatar, Text } from '../primitives';
import { cn } from '../lib/cn';

/**
 * ChatBubble — X8 (커버리지 매트릭스 §X8).
 *
 * SSOT: all-screens 와이어프레임 `.s13a .msg`/`.bub`/`.nm`/`.mention` CSS (S13a
 * 방 내부 슬라이드업 채팅 시트) + 커버리지 매트릭스 §X8. 흡수 별칭:
 * ChatBubble / WhisperBubble / MentionToken(텍스트 변형).
 *
 * 의존 primitives: Avatar(28px), Text. (둘 다 `../primitives` 에서 import.)
 *
 * 규칙(DS 강제 D-04):
 *  - 색·치수는 전부 @dei/ui 토큰 className 으로만 표현(inline style / raw hex 금지).
 *  - HTML `--bg-2`→`bg-bg-2`, `--ink`→`bg-ink`/`text-ink`, `--accent-soft`→
 *    `bg-accent-soft`, `--accent`→`border-accent`/`text-accent`, `--accent-deep`→
 *    `text-accent-deep`. `.bub` `border-radius:14px` = `--r-md` → `rounded-md`.
 *
 * variant (메시지 행 레이아웃 — `.msg` 클래스 분기)
 *  - `them`    상대 메시지: bg-2 버블, 좌측 정렬, 아바타 + 이름 표시 (`.msg`)
 *  - `me`      내 메시지: ink 버블 + 흰 글씨, 우측 정렬, 아바타·이름 숨김 (`.msg.me`)
 *  - `whisper` 귓속말: accent-soft 버블 + accent 점선 보더 + accent-deep 이탤릭
 *             텍스트, full-width, 이름 뒤 " → 귓속말" 접미 (`.msg.whisper`)
 *  - `mention` 인라인 @멘션 토큰: accent 700 (`.bub .mention`) — 버블 본문 안에
 *             섞어 쓰는 텍스트 변형. 행 레이아웃이 아니라 Text 한 조각이다.
 */
export type ChatBubbleVariant = 'them' | 'me' | 'whisper' | 'mention';

/** whisper 행 이름 뒤에 붙는 접미 (HTML `.whisper .nm::after`). */
const WHISPER_SUFFIX = ' → 귓속말';

/**
 * `.msg` 행 컨테이너 className.
 *  them    : flex-row gap-8 max-w-78% (기본)
 *  me      : self-end (우측 정렬)
 *  whisper : self-stretch max-w-full (전폭)
 */
const ROW_CLASS: Record<Exclude<ChatBubbleVariant, 'mention'>, string> = {
  // .s13a .msg: display flex; gap 8px; max-width 78%
  them: 'flex-row gap-[8px] max-w-[78%]',
  // .s13a .msg.me: align-self flex-end
  me: 'flex-row gap-[8px] max-w-[78%] self-end',
  // .s13a .msg.whisper: align-self stretch; max-width 100%
  whisper: 'flex-row gap-[8px] max-w-full self-stretch',
};

/**
 * `.bub` 버블 className.
 *  them    : bg-2, ink, padding 8/12, r-md, 13px/1.4 (기본)
 *  me      : bg-ink, white
 *  whisper : bg-accent-soft, accent-deep, 1px dashed accent, italic
 */
const BUBBLE_CLASS: Record<Exclude<ChatBubbleVariant, 'mention'>, string> = {
  // .s13a .msg .bub: background bg-2; padding 8px 12px; r-md; color ink; 13px
  them: 'self-start rounded-md bg-bg-2 px-[12px] py-[8px]',
  // .s13a .msg.me .bub: background ink; color white
  me: 'self-end rounded-md bg-ink px-[12px] py-[8px]',
  // .s13a .msg.whisper .bub: accent-soft bg; accent-deep text; dashed accent border; italic
  whisper: 'self-stretch rounded-md border border-dashed border-accent bg-accent-soft px-[12px] py-[8px]',
};

/** 버블 본문 Text className (13px/1.4 + variant 별 색). HTML `.bub` color. */
const BUBBLE_TEXT_CLASS: Record<Exclude<ChatBubbleVariant, 'mention'>, string> = {
  them: 'text-[13px] leading-[18px] text-ink',
  me: 'text-[13px] leading-[18px] text-white',
  // whisper: accent-deep + italic (HTML font-style:italic)
  whisper: 'text-[13px] leading-[18px] italic text-accent-deep',
};

export interface ChatBubbleProps extends ViewProps {
  /** 메시지 행 레이아웃/색 변형. 기본 `them`. */
  variant?: ChatBubbleVariant;
  /**
   * 발신자 이름(`.nm`). `them`/`whisper` 에서 버블 위에 표시. `me` 는 숨김.
   * whisper 는 자동으로 `" → 귓속말"` 접미가 붙는다.
   */
  name?: string;
  /** 좌측 아바타 이니셜(`.av`, 28px). `them` 에서만 표시(me/whisper 는 없음). */
  avatarInitial?: string;
  /** 아바타 배경 className(§3A peer 색 등). 예: `bg-[#7A8DB8]`. */
  avatarBg?: string;
  /** 버블 본문. 문자열이면 자동으로 Text 래핑, 노드면 그대로 렌더(인라인 mention 혼용). */
  children?: React.ReactNode;
  className?: string;
}

type RNTextRef = React.ComponentRef<typeof Text>;
interface MentionTokenProps extends React.ComponentProps<typeof Text> {
  className?: string;
}

/**
 * 인라인 @멘션 토큰 (`.bub .mention`): accent 700.
 * 버블 본문 안에 다른 Text 조각과 섞어 쓰는 텍스트 변형이라 행 레이아웃이 없다.
 */
const MentionToken = React.forwardRef<RNTextRef, MentionTokenProps>(function MentionToken(
  { children, className, ...rest },
  ref,
) {
  return (
    <Text
      ref={ref}
      className={cn('text-[13px] font-bold text-accent', className)}
      {...rest}
    >
      {children}
    </Text>
  );
});

/**
 * ChatBubble pattern. `mention` 변형은 인라인 Text 토큰(MentionToken)으로
 * 위임하고, 나머지(them/me/whisper)는 `.msg` 행 → 아바타 + (이름 + `.bub`) 구조로
 * 렌더한다. `props.className` 은 `cn()` 으로 마지막 병합(last-wins).
 */
export const ChatBubble = React.forwardRef<View, ChatBubbleProps>(function ChatBubble(
  {
    variant = 'them',
    name,
    avatarInitial,
    avatarBg,
    children,
    className,
    accessibilityRole,
    ...rest
  },
  ref,
) {
  // mention: 행이 아니라 인라인 텍스트 토큰. View 가 아닌 Text 를 반환한다.
  if (variant === 'mention') {
    return <MentionToken className={className as string}>{children}</MentionToken>;
  }

  // me 는 이름 숨김(`.msg.me .nm{display:none}`). them/whisper 만 이름 표시.
  const showName = variant !== 'me' && name != null;
  // them 만 좌측 아바타 표시(me/whisper 는 `.av` 없음).
  const showAvatar = variant === 'them' && avatarInitial != null;
  // whisper 이름엔 " → 귓속말" 접미(`.nm::after`).
  const displayName = variant === 'whisper' && name != null ? `${name}${WHISPER_SUFFIX}` : name;

  // 문자열 children 은 본문 색을 입혀 Text 로 래핑. 노드면 그대로(인라인 mention 혼용).
  const body =
    typeof children === 'string' ? (
      <Text className={BUBBLE_TEXT_CLASS[variant]}>{children}</Text>
    ) : (
      children
    );

  return (
    <View
      ref={ref}
      accessibilityRole={accessibilityRole}
      className={cn(ROW_CLASS[variant], className)}
      {...rest}
    >
      {showAvatar ? <Avatar initial={avatarInitial} size={28} bg={avatarBg} /> : null}

      {/* .col: flex column (이름 + 버블) */}
      <View className="min-w-0 flex-1">
        {showName ? (
          // .nm: 10.5px ink-3 600 / whisper 는 accent 700
          <Text
            className={cn(
              'mb-[3px] text-[10.5px] font-semibold',
              variant === 'whisper' ? 'font-bold text-accent' : 'text-ink-3',
            )}
          >
            {displayName}
          </Text>
        ) : null}

        {/* .bub */}
        <View className={BUBBLE_CLASS[variant]}>{body}</View>
      </View>
    </View>
  );
});

ChatBubble.displayName = 'ChatBubble';

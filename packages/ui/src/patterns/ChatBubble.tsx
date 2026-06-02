import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { AlertCircle } from 'lucide-react-native';

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
 *             텍스트. 이름줄에 작은 accent `귓속말` 태그 칩을 노출한다(방향
 *             안내 "→ 나에게" 류는 제거 — S13a 재구성). 받은 귓속말은 보낸이
 *             아바타(좌) + 이름 + 태그, 내가 보낸 귓속말(`mine`)은 내 아바타(우,
 *             `flex-row-reverse`) + 태그만(이름 숨김) + 우측정렬 + 실패 시 재시도.
 *  - `mention` 인라인 @멘션 토큰: accent 700 (`.bub .mention`) — 버블 본문 안에
 *             섞어 쓰는 텍스트 변형. 행 레이아웃이 아니라 Text 한 조각이다.
 */
export type ChatBubbleVariant = 'them' | 'me' | 'whisper' | 'mention';

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
  // 받은 귓속말: 보낸이 아바타(좌) + 버블. 좌측 정렬·폭 제한(them 과 동일 골격).
  whisper: 'flex-row gap-[8px] max-w-[84%] self-start',
};

/**
 * 내가 보낸 귓속말(mine) 발신측 행: me 처럼 우측정렬 + 아바타가 우측에 오도록
 * `flex-row-reverse`(아바타가 행 끝). 기본 whisper(수신/좌측 아바타)와 달리
 * self-end + max-w-78% 로 me 와 시각적으로 통일(귓속말 아바타 복원).
 */
const WHISPER_MINE_ROW_CLASS = 'flex-row-reverse gap-[8px] max-w-[78%] self-end';

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
  whisper: 'self-start rounded-md border border-dashed border-accent bg-accent-soft px-[12px] py-[8px]',
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
   * whisper 는 이름에 `"→"` 가 없을 때만 자동으로 `" → 귓속말"` 접미가 붙는다
   * (방향 이름 "→ 민준에게"/"수아 → 나에게" 를 넘기면 접미 생략, body-render-9).
   */
  name?: string;
  /**
   * `whisper` 변형 한정: 내가 보낸 귓속말(발신측 뷰)이면 true.
   * me 처럼 우측정렬 + 송신 실패 시 재시도 컨트롤을 노출한다(body-render-9).
   */
  mine?: boolean;
  /** 좌측 아바타 이니셜(`.av`, 28px). `them` 에서만 표시(me/whisper 는 없음). */
  avatarInitial?: string;
  /** 아바타 배경 className(§3A peer 색 등). 예: `bg-[#7A8DB8]`. */
  avatarBg?: string;
  /** 좌측 아바타 프로필 이미지 URL. 지정 시 이니셜 대신 원형 이미지(Avatar 위임). */
  avatarPhotoUrl?: string;
  /**
   * 아바타 탭 핸들러. 지정 시 `them` 아바타를 Pressable(role=button,
   * label=`<name> 프로필 보기`) 로 감싸 프로필 라우팅 트리거에 쓴다.
   */
  onAvatarPress?: () => void;
  /**
   * `mention` 변형 한정: 어두운 버블(me=ink) 위 렌더 여부.
   * true 면 대비 보정으로 `accent-soft` 사용(body-render-8). 기본 false.
   */
  onDark?: boolean;
  /** 버블 본문. 문자열이면 자동으로 Text 래핑, 노드면 그대로 렌더(인라인 mention 혼용). */
  children?: React.ReactNode;
  className?: string;
  /** me 변형 한정 송신 상태(클라 낙관). 기본 'sent'. */
  sendState?: 'sending' | 'sent' | 'failed';
  /** failed일 때 '!' 탭 재시도. */
  onRetry?: () => void;
  /** 재시도 접근성 라벨. 기본 '전송 재시도'. */
  retryAccessibilityLabel?: string;
}

type RNTextRef = React.ComponentRef<typeof Text>;
export interface MentionTokenProps extends React.ComponentProps<typeof Text> {
  className?: string;
  /**
   * 어두운 버블 배경(me=ink) 위에 얹힐 때 true.
   * accent(#FF2D6F)는 ink(#191919) 대비가 부족해(body-render-8) 밝은
   * `accent-soft`(#FFE9EF) 로 보정한다. them/whisper(밝은 배경)는 false 유지.
   */
  onDark?: boolean;
}

/**
 * 인라인 @멘션 토큰 (`.bub .mention`): accent 700.
 * 버블 본문 안에 다른 Text 조각과 섞어 쓰는 텍스트 변형이라 행 레이아웃이 없다.
 * `onDark` 면 me(ink) 배경 대비 보정으로 `text-accent-soft` 사용(body-render-8).
 */
export const MentionToken = React.forwardRef<RNTextRef, MentionTokenProps>(function MentionToken(
  { children, className, onDark = false, ...rest },
  ref,
) {
  return (
    <Text
      ref={ref}
      className={cn(
        'text-[13px] font-bold',
        onDark ? 'text-accent-soft' : 'text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
});

MentionToken.displayName = 'MentionToken';

/**
 * ChatBubble pattern. `mention` 변형은 인라인 Text 토큰(MentionToken)으로
 * 위임하고, 나머지(them/me/whisper)는 `.msg` 행 → 아바타 + (이름 + `.bub`) 구조로
 * 렌더한다. `props.className` 은 `cn()` 으로 마지막 병합(last-wins).
 */
export const ChatBubble = React.forwardRef<View, ChatBubbleProps>(function ChatBubble(
  {
    variant = 'them',
    name,
    mine = false,
    avatarInitial,
    avatarBg,
    avatarPhotoUrl,
    onAvatarPress,
    onDark = false,
    children,
    className,
    sendState = 'sent',
    onRetry,
    retryAccessibilityLabel = '전송 재시도',
    accessibilityRole,
    ...rest
  },
  ref,
) {
  // mention: 행이 아니라 인라인 텍스트 토큰. View 가 아닌 Text 를 반환한다.
  if (variant === 'mention') {
    return (
      <MentionToken className={className as string} onDark={onDark}>
        {children}
      </MentionToken>
    );
  }

  // me 와 '내가 보낸 귓속말'은 이름 숨김(`.msg.me .nm{display:none}`).
  // them / 받은 귓속말만 보낸이 이름 표시. (방향 안내 "→ 나에게" 등은 제거)
  const showName = (variant === 'them' || (variant === 'whisper' && !mine)) && name != null;
  // 아바타 표시: them + 귓속말(받은=좌, 내가 보낸=우, row-reverse). me 는 아바타 없음.
  // 이니셜·photoUrl 중 하나라도 있으면 표시(photoUrl 만으로도 아바타 surface).
  const showAvatar =
    (variant === 'them' || variant === 'whisper') &&
    (avatarInitial != null || avatarPhotoUrl != null);
  // 귓속말은 이름 라인에 항상 '귓속말' 태그를 노출(내가 보낸 귓속말은 이름 없이 태그만).
  const showWhisperTag = variant === 'whisper';
  // mine 귓속말은 me 처럼 우측정렬. 그 외는 변형별 기본 행 레이아웃.
  const rowClass = variant === 'whisper' && mine ? WHISPER_MINE_ROW_CLASS : ROW_CLASS[variant];
  // me 이거나 mine 귓속말이면 송신 상태/재시도를 표시(내가 보낸 메시지 발신측).
  const isMineSender = variant === 'me' || (variant === 'whisper' && mine);

  // 문자열 children 은 본문 색을 입혀 Text 로 래핑. 노드면 그대로(인라인 mention 혼용).
  const body =
    typeof children === 'string' ? (
      <Text className={BUBBLE_TEXT_CLASS[variant]}>{children}</Text>
    ) : (
      children
    );

  // 좌측 아바타 노드(them 한정). photoUrl 우선, 없으면 이니셜 폴백.
  const avatarNode = showAvatar ? (
    <Avatar initial={avatarInitial} photoUrl={avatarPhotoUrl} size={28} bg={avatarBg} />
  ) : null;

  return (
    <View
      ref={ref}
      accessibilityRole={accessibilityRole}
      className={cn(
        rowClass,
        // me 낙관 송신: 'sending' 동안 행 전체 흐림(스피너 불가 — Spinner 36|80만). D-04.
        sendState === 'sending' && 'opacity-60',
        className,
      )}
      {...rest}
    >
      {avatarNode != null && onAvatarPress != null ? (
        // 아바타 탭 → 프로필 라우팅 트리거(role=button). 목적지 화면은 caller 책임.
        <Pressable
          testID="chat-bubble-avatar"
          accessibilityRole="button"
          accessibilityLabel={name != null ? `${name} 프로필 보기` : '프로필 보기'}
          onPress={onAvatarPress}
        >
          {avatarNode}
        </Pressable>
      ) : (
        avatarNode
      )}

      {/* .col: flex column (이름줄 + 버블) */}
      <View className="min-w-0 flex-1">
        {showName || showWhisperTag ? (
          // 이름줄: 보낸이 이름(.nm 10.5px) + (귓속말이면) 'accent' 태그 칩.
          // 내가 보낸 귓속말은 이름 없이 태그만 + 우측 정렬(아바타가 우측이므로).
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

        {/* .bub — 내가 보낸 귓속말(mine)은 아바타가 우측이라 버블도 우측 정렬. */}
        <View className={cn(BUBBLE_CLASS[variant], variant === 'whisper' && mine && 'self-end')}>
          {body}
        </View>

        {/* 내가 보낸 메시지(me/내 귓속말) 송신 실패: 버블 아래 우측 탭 재시도(danger). */}
        {isMineSender && sendState === 'failed' ? (
          <Pressable
            testID="chat-bubble-retry"
            accessibilityRole="button"
            accessibilityLabel={retryAccessibilityLabel}
            onPress={onRetry}
            className="mt-[2px] flex-row items-center gap-[3px] self-end"
          >
            <AlertCircle size={13} color="#D62D2D" />
            <Text className="text-[10.5px] font-semibold text-danger">재시도</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

ChatBubble.displayName = 'ChatBubble';

import * as React from 'react';

import { MentionToken, Text } from '@dei/ui';

/**
 * 본문 @멘션 토크나이저 (G-B / body-render-2·4·6·7·8).
 *
 * 채팅 본문 문자열을 `@토큰` 강조 조각과 평문 조각으로 분해해 ReactNode 배열로
 * 돌려준다. 호출부(RoomChatView)는 이 배열을 ChatBubble children 으로 주입해
 * 인라인 mention 혼용 렌더를 얻는다(낙관 버블 포함 일관 강조).
 *
 * 규칙:
 *  - 전역 `/@(\S+)/g` 로 분해 — `@` 뒤 비공백 1자 이상만 강조(`@` 단독/빈 토큰은
 *    그룹이 비어 매칭 안 됨 → 평문, body-render-6). 다중 @ 전역 매칭(body-render-7).
 *  - 강조 기준은 **현재 멤버명 prefix 가 아니라 `@\S+` 패턴 자체**(body-render-4):
 *    닉변·과거 멘션·left 멤버에도 일관 강조. 그래서 멤버 목록을 인자로 받지 않는다.
 *  - 평문 조각은 variant 별 본문 색 Text(노드 children 은 ChatBubble 이 색을 안
 *    입히므로 여기서 직접 부여). mention 조각은 MentionToken(accent 볼드).
 *  - me 버블(어두운 ink 배경)에선 accent 대비 부족 → `onDark` 로 mention/평문 색을
 *    밝은 계열로 보정(body-render-8).
 */
export type RenderBodyVariant = 'them' | 'me' | 'whisper';

export interface RenderBodyOpts {
  /** 메시지 버블 변형. 평문 조각의 본문 색을 결정. 기본 'them'. */
  variant?: RenderBodyVariant;
  /**
   * 어두운 버블(me=ink) 위 렌더 여부. mention/평문 색 대비 보정(body-render-8).
   * 미지정 시 variant 로 유추(me → true).
   */
  onDark?: boolean;
}

/** 평문 조각 본문 색 className(ChatBubble BUBBLE_TEXT_CLASS 와 동일 토큰). */
const PLAIN_TEXT_CLASS: Record<RenderBodyVariant, string> = {
  them: 'text-[15px] leading-[18px] text-ink',
  me: 'text-[15px] leading-[18px] text-white',
  whisper: 'text-[15px] leading-[18px] italic text-accent-deep',
};

/** `@토큰`(최소 1자) 전역 매칭. 글로벌 플래그라 호출마다 새로 만든다(lastIndex 안전). */
const MENTION_RE = /@(\S+)/g;

/**
 * 본문 문자열을 [평문 Text, mention MentionToken, ...] ReactNode 배열로 분해.
 * @param body 메시지 본문.
 * @param opts variant / onDark.
 */
export function renderBodyWithMentions(
  body: string,
  opts: RenderBodyOpts = {},
): React.ReactNode[] {
  if (body.length === 0) return [];

  const variant = opts.variant ?? 'them';
  const onDark = opts.onDark ?? variant === 'me';
  const plainClass = PLAIN_TEXT_CLASS[variant];

  const nodes: React.ReactNode[] = [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let lastIndex = 0;
  let segment = 0;
  let match: RegExpExecArray | null;

  const pushPlain = (text: string) => {
    if (text.length === 0) return;
    nodes.push(
      <Text key={`t${segment++}`} className={plainClass}>
        {text}
      </Text>,
    );
  };

  while ((match = re.exec(body)) !== null) {
    // 매칭 앞 평문.
    pushPlain(body.slice(lastIndex, match.index));
    // mention 조각: 전체 매칭(`@닉네임`) 자체를 강조.
    nodes.push(
      <MentionToken key={`m${segment++}`} onDark={onDark}>
        {match[0]}
      </MentionToken>,
    );
    lastIndex = match.index + match[0].length;
  }

  // 마지막 평문 꼬리.
  pushPlain(body.slice(lastIndex));

  return nodes;
}

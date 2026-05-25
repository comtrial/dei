/**
 * @멘션 파서 — UI 입력 측 보조.
 *
 * 서버 RPC (`send_chat_message`) 도 동일한 정규식으로 멘션을 파싱해 `chat_mentions`
 * row 를 만든다. 이 모듈은 클라가 **컴포저에서 자동완성을 띄울 때** 와 **버블에서
 * 멘션 토큰을 강조 표시할 때** 사용한다.
 *
 * 정규식은 DB 함수와 동일: `@([A-Za-z0-9가-힣_]{2,30})`.
 */

export const MENTION_REGEX = /@([A-Za-z0-9가-힣_]{2,30})/g;

export type MentionToken = {
  /** lowercased nickname (DB 의 nickname_lower 와 일치) */
  nickname: string;
  /** "@nick" 그 자체 (원래 대소문자/공백 보존) */
  raw: string;
  /** 본문 안에서의 시작/끝 index (slice 가능) */
  start: number;
  end: number;
};

export function parseMentions(body: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  for (const match of body.matchAll(MENTION_REGEX)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const nick = match[1];
    if (!nick) continue;
    tokens.push({
      nickname: nick.toLowerCase(),
      raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

/**
 * 본문을 plain text / mention 세그먼트로 분할 — 메시지 버블 렌더링 보조.
 */
export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; nickname: string };

export function segmentBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  const tokens = parseMentions(body);
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push({ kind: 'text', text: body.slice(cursor, token.start) });
    }
    segments.push({ kind: 'mention', text: token.raw, nickname: token.nickname });
    cursor = token.end;
  }
  if (cursor < body.length) {
    segments.push({ kind: 'text', text: body.slice(cursor) });
  }
  return segments;
}

/**
 * 컴포저 자동완성 — 커서 위치 기준으로 활성 멘션 prefix 추출.
 *
 * 입력: ("안녕 @하늘아", cursor=6)  → "하"
 * 입력: ("hi everyone",  cursor=2)  → null
 *
 * 반환은 prefix (lowercased, '@' 제외, 빈 prefix 도 허용 — 멤버 전체 목록 표시용).
 * 커서 바로 앞이 '@' + 0~29자 의 nickname-safe 문자열일 때만 결과 반환.
 */
export function extractActiveMentionPrefix(
  body: string,
  cursor: number,
): { prefix: string; start: number } | null {
  if (cursor < 0 || cursor > body.length) return null;

  // 커서 바로 앞에서 시작해 nickname-safe 문자를 거꾸로 모음.
  let i = cursor;
  let count = 0;
  while (i > 0 && count < 30) {
    const ch = body[i - 1];
    if (!/[A-Za-z0-9가-힣_]/.test(ch)) break;
    i -= 1;
    count += 1;
  }

  const atIndex = i - 1;
  if (atIndex < 0 || body[atIndex] !== '@') return null;

  // 앞 글자가 공백 / 줄바꿈 / 본문 시작이어야 함 (이메일 등과 충돌 방지)
  if (atIndex > 0 && !/\s/.test(body[atIndex - 1])) return null;

  const prefix = body.slice(i, cursor).toLowerCase();
  return { prefix, start: atIndex };
}

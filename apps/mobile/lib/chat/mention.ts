export interface RoomMemberLite {
  userId: string;
  name: string;
  status: 'active' | 'left' | 'auto_kicked';
  avatarInitial?: string;
  avatarBg?: string;
  /** 프로필 이미지 URL. Avatar/ChatBubble 로 전달돼 이니셜 대신 원형 이미지 렌더. */
  photoUrl?: string;
}

/**
 * 닉네임 공백 금지 정책(input-parse-3, out_of_scope (b)).
 *
 * parseMentionQuery 의 query 는 `\S*`(비공백) 이라 공백 포함 닉네임은 prefix 매칭·
 * 탭 선택·G-A 완전일치 자동확정이 모두 불가하다. MVP 는 공백 포함 최장매칭
 * 알고리즘(out_of_scope) 대신 **닉네임 공백 금지를 상류(profile 입력단)에서 강제**
 * 하는 정책으로 해결한다 — 이 파일에는 정책 명시 주석만 남기고 별도 검증 구현은
 * profile 입력단(B 담당) 책임이다. G-A 완전일치 규칙과도 호환된다.
 */

/**
 * 입력 끝의 @쿼리를 파싱(공백 없는 마지막 토큰이 @로 시작).
 *
 * 정규식 `(?:^|\s)@+(\S*)$`: 선행 @ 다수 흡수(input-parse-6). `@@`→query ''(둘째 @
 * 까지 흡수), `@@수`→query '수'(마지막 @ 만 트리거). 이메일/핸들류는 (^|\s) 경계
 * 요구라 트리거 안 함(input-parse-8 의도 유지).
 */
export function parseMentionQuery(text: string): { active: boolean; query: string } {
  const m = /(?:^|\s)@+(\S*)$/.exec(text);
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

/** resolveTailMention 결과. */
export interface TailMentionResolution {
  /**
   * - `confirmed`: 입력 끝 @토큰이 완전일치 && 유일한 후보 → 자동 귓속말 확정.
   *   `target` + `strippedInput`(tail @토큰 제거) 제공.
   * - `ambiguous`: 후보가 있으나 자동확정 불가(2명+ 또는 prefix-만-일치) → send 보류,
   *   드롭다운으로 명시 선택 유도(평문 오발신 차단).
   * - `none`: @쿼리 비active 또는 후보 0명 → 평문 전송 허용.
   */
  kind: 'confirmed' | 'ambiguous' | 'none';
  target?: RoomMemberLite;
  /** confirmed 일 때만: 입력에서 tail @토큰을 제거한 본문(트레일링 공백 정리). */
  strippedInput?: string;
}

/**
 * G-A: 입력 끝 @토큰을 해석해 풀네임 타이핑(드롭다운 미탭) 귓속말 누설을 막는다.
 *
 * 규칙(확정):
 *  - parseMentionQuery 가 inactive → `none`(평문).
 *  - filterCandidates(active + self/blocked 제외 + prefix) 결과가
 *    - 정확히 1명 && 그 닉네임이 query 와 완전일치(대소문자 무시) → `confirmed`
 *      (strippedInput = 입력에서 tail `@토큰` 제거, 트레일링 공백 trim).
 *    - 1명이지만 완전일치 아님(예: '@수'→'수아') → `ambiguous`(자동확정 금지, send 보류).
 *    - 2명 이상 → `ambiguous`.
 *    - 0명(self/left/blocked/없는닉네임 포함) → `none`(자동확정 안 됨; 평문).
 *
 * self 닉네임 입력은 filterCandidates 가 0건 처리 → `none` 이라 자동 귓속말로 잘못
 * 확정되지 않는다(누설 차단).
 */
export function resolveTailMention(
  input: string,
  members: RoomMemberLite[],
  opts: { selfId: string; blockedIds: Set<string> },
): TailMentionResolution {
  const parsed = parseMentionQuery(input);
  if (!parsed.active) return { kind: 'none' };

  const candidates = filterCandidates(members, parsed.query, opts);
  if (candidates.length === 0) return { kind: 'none' };

  if (candidates.length === 1) {
    const target = candidates[0];
    const exact = target.name.toLowerCase() === parsed.query.trim().toLowerCase();
    if (exact) {
      return {
        kind: 'confirmed',
        target,
        strippedInput: stripTailMention(input),
      };
    }
    // prefix-만-일치(완전일치 아님): 자동확정 금지, 명시 선택 유도.
    return { kind: 'ambiguous' };
  }

  // 후보 2명 이상(동명이인 포함): 절대 자동확정 금지.
  return { kind: 'ambiguous' };
}

/** 입력 끝의 `@토큰`(선행 @ 다수 포함)을 제거하고 트레일링 공백을 정리. */
function stripTailMention(input: string): string {
  return input.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, '');
}

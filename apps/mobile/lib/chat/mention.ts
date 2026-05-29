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

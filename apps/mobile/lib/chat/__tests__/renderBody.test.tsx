import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';

// @dei/ui 는 react-native(flow 타입) 를 module-load 시 끌어와 node vitest 에서
// 파싱 불가하므로 가벼운 스텁으로 대체. renderBodyWithMentions 가 어떤 컴포넌트
// 타입으로 노드를 만드는지(구조)만 검증한다(실 렌더는 RNTL/jest 영역).
const ChatBubble = function ChatBubble() {
  return null;
} as unknown as React.ComponentType<Record<string, unknown>>;
const MentionToken = function MentionToken() {
  return null;
} as unknown as React.ComponentType<Record<string, unknown>>;
const Text = function Text() {
  return null;
} as unknown as React.ComponentType<Record<string, unknown>>;

vi.mock('@dei/ui', () => ({ ChatBubble, MentionToken, Text }));

// 동적 import 로 mock 적용 보장.
const { renderBodyWithMentions } = await import('../renderBody');

type El = React.ReactElement<{ children?: React.ReactNode; variant?: string; onDark?: boolean }>;

/** mention 노드 판정: ChatBubble variant='mention' 이거나 MentionToken 타입. */
function isMention(node: React.ReactNode): node is El {
  if (!React.isValidElement(node)) return false;
  const el = node as El;
  if (el.type === MentionToken) return true;
  return el.type === ChatBubble && el.props.variant === 'mention';
}
function isText(node: React.ReactNode): node is El {
  if (!React.isValidElement(node)) return false;
  return (node as El).type === Text;
}
function childText(node: React.ReactNode): string {
  return String((node as El).props.children);
}

describe('renderBodyWithMentions (G-B 본문 @토큰 강조)', () => {
  it("'@민준 안녕' → [mention('@민준'), text(' 안녕')]", () => {
    const nodes = renderBodyWithMentions('@민준 안녕');
    expect(nodes).toHaveLength(2);
    expect(isMention(nodes[0])).toBe(true);
    expect(childText(nodes[0])).toBe('@민준');
    expect(isText(nodes[1])).toBe(true);
    expect(childText(nodes[1])).toBe(' 안녕');
  });

  it('선행 텍스트 + 멘션: 안녕 @민준 → [text, mention]', () => {
    const nodes = renderBodyWithMentions('안녕 @민준');
    expect(nodes).toHaveLength(2);
    expect(isText(nodes[0])).toBe(true);
    expect(childText(nodes[0])).toBe('안녕 ');
    expect(isMention(nodes[1])).toBe(true);
    expect(childText(nodes[1])).toBe('@민준');
  });

  it('다중 @ — 전역 매칭으로 mention 조각 2개', () => {
    const nodes = renderBodyWithMentions('@수아 @수민 둘다');
    const mentions = nodes.filter(isMention);
    expect(mentions.map(childText)).toEqual(['@수아', '@수민']);
  });

  it("'@' 없는 본문 → 단일 text 노드", () => {
    const nodes = renderBodyWithMentions('그냥 평범한 메시지');
    expect(nodes).toHaveLength(1);
    expect(isText(nodes[0])).toBe(true);
    expect(childText(nodes[0])).toBe('그냥 평범한 메시지');
  });

  it("'@' 단독(빈 토큰)은 강조 안 함 → plain text", () => {
    const nodes = renderBodyWithMentions('이메일 @ 단독');
    // '@' 뒤 \S+ 그룹이 비어 매칭 안 됨 → 전부 평문
    expect(nodes.some(isMention)).toBe(false);
    expect(nodes.map(childText).join('')).toBe('이메일 @ 단독');
  });

  it('멤버명 prefix 매칭이 아니라 @\\S+ 패턴 자체로 강조(닉변/나간멤버 일관)', () => {
    // 멤버 목록을 받지 않아도 @누구든 강조됨
    const nodes = renderBodyWithMentions('@이미나간사람 봤어?');
    expect(isMention(nodes[0])).toBe(true);
    expect(childText(nodes[0])).toBe('@이미나간사람');
  });

  it('빈 문자열 → 빈 배열', () => {
    expect(renderBodyWithMentions('')).toEqual([]);
  });

  it('모든 노드에 key 부여 + 중복 없음', () => {
    const nodes = renderBodyWithMentions('@수아 와 @수민 그리고 텍스트');
    const keys = nodes
      .filter(React.isValidElement)
      .map((n) => (n as React.ReactElement).key);
    expect(keys.every((k) => k != null)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('opts.onDark → mention 노드에 onDark 전달(me 버블 대비 보정, body-render-8)', () => {
    const nodes = renderBodyWithMentions('@수아 안녕', { onDark: true });
    const mention = nodes.find(isMention) as El;
    expect(mention.props.onDark).toBe(true);
  });

  it('opts 미지정 시 mention onDark 는 falsy(them/whisper 기본)', () => {
    const nodes = renderBodyWithMentions('@수아 안녕');
    const mention = nodes.find(isMention) as El;
    expect(mention.props.onDark).toBeFalsy();
  });
});

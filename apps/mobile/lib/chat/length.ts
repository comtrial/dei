/** 글자수 = code point (DB char_length, Edge, 클라 동일 단위). */
export const MAX_BODY = 500;
export function messageLength(s: string): number {
  return [...s].length;
}
export function isSendable(s: string): boolean {
  const n = messageLength(s.trim());
  return n >= 1 && n <= MAX_BODY;
}

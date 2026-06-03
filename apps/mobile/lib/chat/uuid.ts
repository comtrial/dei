// apps/mobile/lib/chat/uuid.ts
// RN-safe UUID v4 생성기.
//
// React Native(Hermes)에는 표준 `crypto.randomUUID` 가 없어
// `globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`` 폴백이
// **비-UUID 문자열**(예: "1780405525523-0.62...")을 만들었고, 이게 client_msg_id(uuid)
// 컬럼 캐스팅에서 `invalid input syntax for type uuid` 로 깨져 **모든 메시지 전송이 실패**했다.
//
// client_msg_id 는 멱등/dedup 용 키라 암호학적 강도는 필요 없다(추측 공격 표면 없음).
// 네이티브 의존성 추가 없이 항상 유효한 RFC4122 v4 형식을 보장한다.
// crypto.randomUUID 가 존재하는 런타임(웹 등)에서는 그것을 우선 사용한다.
export function uuidv4(): string {
  const native = globalThis.crypto;
  if (native && typeof native.randomUUID === 'function') {
    return native.randomUUID();
  }
  // Math.random 기반 v4 폴백 (8-4-4-4-12, version=4, variant=8/9/a/b).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

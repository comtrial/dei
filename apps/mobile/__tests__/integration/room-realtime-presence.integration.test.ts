import { describe, it } from 'vitest';

import { isSupabaseReachable } from './setup';

describe.skip('room realtime presence integration', () => {
  it.todo('두 클라이언트 — 한쪽 track → 다른 쪽 sync 수신');
  it.todo('한쪽 leave → 반대편 onMemberLeft 콜백 트리거');
  it.todo('presence 끊김 복구 — CHANNEL_ERROR 후 재구독 시 sync 재수신');
  it.todo('useRoomEndedDetector — 실DB 마지막 멤버 left → grace → onRoomEnded');
});

export { isSupabaseReachable };

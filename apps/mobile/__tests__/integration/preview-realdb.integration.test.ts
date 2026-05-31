import { describe, it } from 'vitest';

import { isSupabaseReachable } from './setup';

describe.skip('RoomPreviewScreen blur gate integration (S10)', () => {
  it.todo('e2e 유저 매칭 mock → preview 진입 → 멤버 N명 닉네임 fetch 확인');
  it.todo('24h 내 영상 없음 → blur 게이트 통과 안 됨 (count=0 확인)');
  it.todo('24h 내 영상 1건 삽입 → blur 게이트 통과 (count>=1 → replace 호출)');
  it.todo('24h 경과 영상만 존재 → blur_reapplied_24h_passed 이벤트 발화 확인');
});

export { isSupabaseReachable };

/**
 * CH0 채팅 진입 라우터 게이트 — 실제 resolveChatRoute + chat.tsx navigate
 * 경로를 DOM/네비 레벨로 검증 (PM 검증서 P0-2).
 *
 * FULL-spec chat_route_resolved:
 *   - ENTERED   : 차단 없음 AND ACTIVE        → CH2(chat-room)
 *   - BLOCKED   : 차단 존재 → "더 이상 대화할 수 없습니다" → navigate H2(home)
 *   - ENDED     : status∈{ENDED,DELETED} → "종료된 대화입니다" → navigate CH1(목록)
 *   - NOT_FOUND : conversation 미해석/미존재 → CH1(목록)
 */
import { expect, test } from '@playwright/test';

async function navTargets(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    JSON.stringify(globalThis.__HARNESS_NAV__ ?? []),
  );
}

test.describe('CH0 진입 라우터 게이트', () => {
  test('ENTERED — 차단 없음 + ACTIVE → CH2(chat-room) 로 replace', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-entered');

    await expect
      .poll(() => navTargets(page), { timeout: 5_000 })
      .toContain('chat-room');
    const nav = await navTargets(page);
    expect(nav).not.toContain('"/home"');
  });

  test('BLOCKED — 차단 존재 → H2(home) 로 replace (CH1 아님)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-blocked');

    await expect
      .poll(() => navTargets(page), { timeout: 5_000 })
      .toContain('/home');
    const nav = await navTargets(page);
    // 회귀 가드: BLOCKED 가 목록(CH1)/방(CH2)으로 가면 안 됨.
    expect(nav).not.toContain('chat-room');
    expect(nav).not.toContain('/messages');
  });

  test('ENDED — status=ENDED → CH1(messages) 로 replace (home 아님)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-ended');

    await expect
      .poll(() => navTargets(page), { timeout: 5_000 })
      .toContain('/messages');
    const nav = await navTargets(page);
    expect(nav).not.toContain('/home');
    expect(nav).not.toContain('chat-room');
  });

  test('NOT_FOUND — conversation 미존재 → CH1(messages)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-not-found');

    await expect
      .poll(() => navTargets(page), { timeout: 5_000 })
      .toContain('/messages');
  });
});

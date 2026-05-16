/**
 * 나머지 채팅 flow 의 핵심 분기 — DOM/네비 레벨 (10-C / 10-D / 10-G / 10-H / 10-I).
 *
 * FULL-spec(payload_json/condition 권위) 정합:
 *   - 10-C  OP3 → CH0 라우터 (source=op3): CH0 가 ENTERED/BLOCKED/ENDED 흡수.
 *           gate-* 시나리오로 CH0 동일 게이트 통과를 검증 (source 무관).
 *   - 10-D  푸시 deeplink(conversationId) → CH0(source=push): 동일 게이트.
 *           만료/차단 시 라우터가 흡수 (BLOCKED→H2 / ENDED→CH1).
 *   - 10-G  CH4 "상대 프로필 보기" / CH2 헤더 → OP3 (cross-WF). OP3 라우트
 *           부재 시 funnel 비차단 안전 degrade(navigate 없음).
 *   - 10-H  B-CH6: conversation.ended → 무음(토스트 0) 250ms → H2(home) 복귀.
 *   - 10-I  CH3 빈 상태 "일상 로그 기록하기" → R3(record) cross-WF.
 */
import { expect, test } from '@playwright/test';

async function nav(page: import('@playwright/test').Page) {
  return JSON.stringify(
    (await page.evaluate(() => globalThis.__HARNESS_NAV__)) ?? [],
  );
}

test.describe('10-C OP3 → CH0 통합 라우터', () => {
  test('OP3 진입(source 무관) 차단 없음+ACTIVE → CH2 (CH0 ENTERED)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-entered');
    await expect.poll(() => nav(page), { timeout: 5_000 }).toContain('chat-room');
  });

  test('OP3 진입 후 차단 상태 → CH0 가 BLOCKED 흡수 → H2(home)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-blocked');
    await expect.poll(() => nav(page), { timeout: 5_000 }).toContain('/home');
    expect(await nav(page)).not.toContain('chat-room');
  });
});

test.describe('10-D 푸시 deeplink → CH0 (만료/차단 흡수)', () => {
  test('푸시 deeplink + ENDED 대화 → CH0 가 "종료된 대화입니다" 흡수 → CH1', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-ended');
    await expect.poll(() => nav(page), { timeout: 5_000 }).toContain('/messages');
    // ENDED 는 H2 아님(스펙: BLOCKED=H2, ENDED=CH1) — 회귀 가드.
    expect(await nav(page)).not.toContain('/home');
    expect(await nav(page)).not.toContain('chat-room');
  });

  test('푸시 deeplink + 차단 → BLOCKED → H2(home) (CH1 아님)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-blocked');
    await expect.poll(() => nav(page), { timeout: 5_000 }).toContain('/home');
    expect(await nav(page)).not.toContain('/messages');
  });
});

test.describe('10-G CH2/CH4 → OP3 (cross-WF 안전 degrade)', () => {
  test('CH4 "상대 프로필 보기" → OP3 라우트 부재 → navigate 0건(머무름)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-more').click();
    await page.getByTestId('chat-more-view-profile').click();

    // OP3 라우트 미구현 → 안전 degrade: 채팅방 유지, 어떤 화면으로도 이동 안 함.
    await expect(page.getByTestId('chat-room')).toBeVisible();
    const n = await nav(page);
    expect(n).not.toContain('chat-room"'); // self push 없음
    expect(n).not.toContain('/messages');
    expect(n).not.toContain('/home');
  });

  test('CH2 헤더 아바타 tap (alt 경로) → OP3 degrade, 채팅방 유지', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-profile').click();

    await expect(page.getByTestId('chat-room')).toBeVisible();
    const n = await nav(page);
    expect(n).not.toContain('/messages');
    expect(n).not.toContain('/home');
  });
});

test.describe('10-H B-CH6 무음 정리 → H2(home) 자동 복귀', () => {
  test('상대 나감 수신 → 토스트 0 + 250ms 후 H2(home) replace (CH1 아님)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-ended-incoming');
    await expect(page.getByTestId('chat-room')).toBeVisible();

    await expect.poll(() => nav(page), { timeout: 5_000 }).toContain('/home');

    // B-CH6: 목적지는 H2(home). CH1(messages) 로 가던 버그 회귀 가드.
    const n = await nav(page);
    expect(n).not.toContain('/messages');
    // 무음: 화면에 에러 배너/토스트 컨테이너 없음.
    await expect(page.getByTestId('chat-send-error')).toHaveCount(0);
  });
});

test.describe('10-I CH3 빈 상태 → R3(record) cross-WF', () => {
  test('"일상 로그 기록하기" → /record 로 push', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-empty');

    await expect(page.getByTestId('chat-empty-state')).toBeVisible();
    await page.getByTestId('chat-empty-record').click();

    expect(await nav(page)).toContain('/record');
  });
});

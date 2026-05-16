/**
 * CH1 채팅 목록 + CH3 빈 상태 — DOM 레벨 검증 (10-B / 10-I).
 *
 * react-native-web 은 testID 를 DOM `data-testid` 로 렌더한다.
 */
import { expect, test } from '@playwright/test';

test.describe('CH1 채팅 목록', () => {
  test('대화 N건 → 목록 렌더 + 행 tap 시 CH0 라우터로 push', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-populated');

    await expect(page.getByTestId('chat-list')).toBeVisible();
    await expect(page.getByTestId('chat-list-row-conv-fixture-1')).toBeVisible();
    await expect(page.getByText('하늘')).toBeVisible();
    await expect(page.getByText('내일 봬요!')).toBeVisible();
    // 미리보기 없음 행 → fallback copy.
    await expect(page.getByText('아직 메시지가 없어요')).toBeVisible();

    await page.getByTestId('chat-list-row-conv-fixture-1').click();

    const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
    expect(nav?.length).toBeGreaterThan(0);
    expect(JSON.stringify(nav)).toContain('conv-fixture-1');
  });

  test('CH3 — 대화 0건 → 빈 상태 + "일상 로그 기록하기" CTA', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-empty');

    await expect(page.getByTestId('chat-empty-state')).toBeVisible();
    await expect(page.getByText('아직 매칭이 없어요')).toBeVisible();
    await expect(page.getByTestId('chat-empty-record')).toBeVisible();

    await page.getByTestId('chat-empty-record').click();
    const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
    expect(JSON.stringify(nav)).toContain('record');
  });

  test('로드 실패 → 에러 상태(재시도 버튼), CH3 빈 상태로 오표시 안 함 (P1-5)', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-error');

    // 네트워크 실패는 별도 에러 상태로.
    await expect(page.getByTestId('chat-list-error')).toBeVisible();
    await expect(page.getByText('목록을 불러오지 못했어요')).toBeVisible();
    await expect(page.getByTestId('chat-list-retry')).toBeVisible();

    // 회귀 가드: 에러를 "아직 매칭이 없어요"(CH3) 로 오표시하면 안 됨.
    await expect(page.getByTestId('chat-empty-state')).toHaveCount(0);
    await expect(page.getByText('아직 매칭이 없어요')).toHaveCount(0);
  });
});

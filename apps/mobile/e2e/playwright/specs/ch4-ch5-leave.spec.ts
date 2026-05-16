/**
 * CH4 더보기 시트 + CH5 나가기 확인 다이얼로그 (10-F / 10-G).
 */
import { expect, test } from '@playwright/test';

test.describe('CH4 더보기 시트 → CH5 나가기', () => {
  test('더보기 → 시트 2개 항목 (상대 프로필 보기 / 나가기)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-more').click();

    await expect(page.getByTestId('chat-more-sheet')).toBeVisible();
    await expect(page.getByTestId('chat-more-view-profile')).toBeVisible();
    await expect(page.getByTestId('chat-more-leave')).toBeVisible();
  });

  test('나가기 → CH5 확인 다이얼로그 (영구 삭제 경고 카피)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-more').click();
    await page.getByTestId('chat-more-leave').click();

    await expect(page.getByTestId('leave-chat-dialog')).toBeVisible();
    await expect(page.getByText('대화에서 나가시겠어요?')).toBeVisible();
    await expect(
      page.getByText('대화 내용이 영구 삭제되며 되돌릴 수 없습니다.'),
    ).toBeVisible();
    await expect(page.getByTestId('leave-chat-cancel')).toBeVisible();
    await expect(page.getByTestId('leave-chat-confirm')).toBeVisible();
  });

  test('CH5 취소 → 다이얼로그 닫힘, 채팅방 유지', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-more').click();
    await page.getByTestId('chat-more-leave').click();
    await expect(page.getByTestId('leave-chat-dialog')).toBeVisible();

    await page.getByTestId('leave-chat-cancel').click();

    await expect(page.getByTestId('leave-chat-dialog')).toHaveCount(0);
    await expect(page.getByTestId('chat-room')).toBeVisible();
  });

  // FULL-spec 10-F: CH5 "나가기" 확정 → CH-API2(leave) → 양쪽 DELETED +
  // soft-delete + UNMATCHED + conversation.ended(LEFT_BY_OTHER). 성공 시
  // payload 의 정확 토스트 "대화에서 나갔습니다" → navigate H2(home).
  // (회귀 가드: 이전엔 토스트 없이 CH1(messages) 로 갔음 — 스펙 불일치.)
  test('CH5 확정 → leave 처리 후 H2(home) 로 replace (10-F, CH1 아님)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-header-more').click();
    await page.getByTestId('chat-more-leave').click();
    await page.getByTestId('leave-chat-confirm').click();

    await expect
      .poll(async () => {
        const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
        return JSON.stringify(nav ?? []);
      }, { timeout: 5_000 })
      .toContain('/home');

    // 회귀 가드: 나가기 성공이 CH1(목록)/CH2(방)로 가면 안 됨 (스펙=H2).
    const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
    expect(JSON.stringify(nav ?? [])).not.toContain('/messages');
  });
});

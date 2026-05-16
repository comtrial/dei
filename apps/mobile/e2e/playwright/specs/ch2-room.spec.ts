/**
 * CH2 채팅방 — 컴포저 글자수/전송/실패 retry + 무음 정리 (10-E / 10-H).
 */
import { expect, test } from '@playwright/test';

test.describe('CH2 채팅방 컴포저', () => {
  test('기존 메시지 스트림 렌더 + 내/상대 버블 구분', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await expect(page.getByTestId('chat-room')).toBeVisible();
    await expect(page.getByText('안녕하세요, 반가워요')).toBeVisible();
    await expect(page.getByText('저도 반가워요')).toBeVisible();
    await expect(page.getByTestId('chat-composer')).toBeVisible();
  });

  test('빈 입력 → 전송 비활성 + 카운터 미표시; 1자+ → 활성 + 카운터', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    const send = page.getByTestId('chat-composer-send');
    await expect(send).toBeDisabled();
    await expect(page.getByTestId('chat-composer-counter')).toHaveCount(0);

    await page.getByTestId('chat-composer-input').fill('안녕');
    await expect(page.getByTestId('chat-composer-counter')).toHaveText('2/500');
    await expect(send).toBeEnabled();
  });

  test('501자 → 전송 비활성 (경계 초과, 서버 호출 없음)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-composer-input').fill('x'.repeat(501));
    await expect(page.getByTestId('chat-composer-counter')).toHaveText('501/500');
    await expect(page.getByTestId('chat-composer-send')).toBeDisabled();
  });

  test('전송 성공 → 낙관적 버블이 확정되고 입력 초기화', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');

    await page.getByTestId('chat-composer-input').fill('첫 메시지');
    await page.getByTestId('chat-composer-send').click();

    await expect(page.getByText('첫 메시지')).toBeVisible();
    // 입력 초기화 → 카운터 사라짐.
    await expect(page.getByTestId('chat-composer-counter')).toHaveCount(0);
  });

  test('전송 실패(재시도 가능) → 인라인 retry 마커 + 실패 토스트, 재시도 성공 (10-E / P0-3)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-send-fail-retry');

    await page.getByTestId('chat-composer-input').fill('실패할 메시지');
    await page.getByTestId('chat-composer-send').click();

    // P0-3: message_send_failed → DISPLAY_MESSAGE_TO_USER (화면 내 배너).
    await expect(page.getByTestId('chat-send-error')).toBeVisible();
    // 재시도 가능 → 인라인 "전송 실패 · 다시 시도" 마커 노출.
    await expect(page.getByText('전송 실패 · 다시 시도')).toBeVisible();

    await page.getByText('전송 실패 · 다시 시도').click();

    // 재시도 성공 → 마커 사라짐.
    await expect(page.getByText('전송 실패 · 다시 시도')).toHaveCount(0);
    await expect(page.getByText('실패할 메시지')).toBeVisible();
  });

  test('전송 실패(차단=비재시도) → retry 마커 미노출 + 토스트 + 방 종료 (P0-3/P0-4)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-send-fail-blocked');

    await page.getByTestId('chat-composer-input').fill('차단된 상대에게');
    await page.getByTestId('chat-composer-send').click();

    // 스펙 payload 정확 문자열로 토스트 노출.
    await expect(page.getByTestId('chat-send-error')).toBeVisible();
    await expect(
      page.getByTestId('chat-send-error').getByText('더 이상 대화할 수 없습니다'),
    ).toBeVisible();

    // 비재시도 → "다시 시도" 마커 절대 미노출 (사용자 오인 방지).
    await expect(page.getByText('전송 실패 · 다시 시도')).toHaveCount(0);

    // BLOCKED → 방 자동 종료 정리 후 H2(home) 복귀 (B-CH6 무음 정리와
    // 동일 경로 — 스펙 정합. 이전 messages 복귀에서 home 으로 수정됨).
    await expect
      .poll(async () => {
        const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
        return JSON.stringify(nav ?? []);
      }, { timeout: 5_000 })
      .toContain('/home');
  });

  test('전송 실패(길이 위반=INVALID) → retry 마커 미노출 + 토스트, 방 유지 (P0-4 회귀)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-send-fail-invalid');

    await page.getByTestId('chat-composer-input').fill('너무 긴 메시지');
    await page.getByTestId('chat-composer-send').click();

    await expect(page.getByTestId('chat-send-error')).toBeVisible();
    // INVALID 가 영구 retry 마커로 남던 버그 회귀 가드.
    await expect(page.getByText('전송 실패 · 다시 시도')).toHaveCount(0);

    // 콘텐츠 오류이므로 방은 닫히지 않는다 → 컴포저 계속 사용 가능.
    await expect(page.getByTestId('chat-composer')).toBeVisible();
    await expect(page.getByTestId('chat-composer-input')).toBeEnabled();
    const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
    expect(JSON.stringify(nav ?? [])).not.toContain('messages');
  });

  test('B-CH6 — 상대 나감 수신 시 무음(토스트 0) 정리 후 H2(home) 복귀 (10-H)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-ended-incoming');

    await expect(page.getByTestId('chat-room')).toBeVisible();

    // FULL-spec B-CH6: 250ms fadeout 후 router.replace(home). 토스트/배너 0건.
    await expect
      .poll(async () => {
        const nav = await page.evaluate(() => globalThis.__HARNESS_NAV__);
        return JSON.stringify(nav ?? []);
      }, { timeout: 5_000 })
      .toContain('/home');
  });
});

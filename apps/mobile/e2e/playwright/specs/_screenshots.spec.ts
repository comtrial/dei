/**
 * Flow별 스크린샷 캡처 — 사용자 전달용 (검증 아닌 산출물 생성).
 *
 * 프로덕션 채팅 화면(react-native-web)을 실제 Chromium 에 렌더해
 * 9개 e2e flow 의 주요 화면/상호작용 후 상태를 PNG 로 저장.
 * 산출: apps/mobile/e2e/screenshots/<NN>-<flow>-<step>.png
 *
 * 실행: pnpm --filter mobile exec playwright test _screenshots --project=chromium
 */
import { test } from '@playwright/test';

const OUT = 'e2e/screenshots';

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(450); // RN-web 레이아웃/애니메이션 안정화
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test.describe('flow별 스크린샷', () => {
  test('10-A · 매칭 직후 → CH0 게이트 → CH2 진입', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-entered');
    await shot(page, '10A-1-ch0-gate-entered');
    await page.goto('/?screen=chat-room&scenario=room-basic');
    await shot(page, '10A-2-ch2-room-entered');
  });

  test('10-B · 탭바 → CH1 목록 → 채팅방', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-populated');
    await shot(page, '10B-1-ch1-list');
    await page.goto('/?screen=chat-room&scenario=room-basic');
    await shot(page, '10B-2-ch2-room');
  });

  test('10-C · OP3 매칭 후 프로필 → 채팅 진입(CH0)', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-entered');
    await shot(page, '10C-1-ch0-from-op3');
  });

  test('10-D · 푸시 deeplink → CH0 라우터', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-entered');
    await shot(page, '10D-1-ch0-from-push');
  });

  test('10-E · 메시지 전송 (성공 / 실패 retry)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');
    await shot(page, '10E-1-composer');
    const input = page.getByTestId('chat-composer-input');
    if (await input.count()) {
      await input.fill('안녕하세요, 반가워요!');
      await shot(page, '10E-2-composer-typed');
    }
    await page.goto('/?screen=chat-room&scenario=room-send-fail-retry');
    const i2 = page.getByTestId('chat-composer-input');
    if (await i2.count()) {
      await i2.fill('전송 실패 케이스');
      const send = page.getByTestId('chat-composer-send');
      if (await send.count()) await send.click();
    }
    await shot(page, '10E-3-send-failed-retry');
  });

  test('10-F · 채팅방 나가기 (CH4 → CH5)', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');
    const more = page.getByTestId('chat-header-more');
    if (await more.count()) {
      await more.click();
      await shot(page, '10F-1-ch4-more-sheet');
      const leave = page.getByTestId('chat-more-leave');
      if (await leave.count()) {
        await leave.click();
        await shot(page, '10F-2-ch5-leave-dialog');
      }
    }
  });

  test('10-G · 채팅방 → 상대 프로필 보기', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-basic');
    const more = page.getByTestId('chat-header-more');
    if (await more.count()) {
      await more.click();
      await shot(page, '10G-1-ch4-view-profile');
    }
  });

  test('10-H · 상대 나감 무음 정리', async ({ page }) => {
    await page.goto('/?screen=chat-room&scenario=room-ended-incoming');
    await shot(page, '10H-1-room-ended-silent');
  });

  test('10-I · 채팅 빈 상태 → 로그 촬영', async ({ page }) => {
    await page.goto('/?screen=messages&scenario=list-empty');
    await shot(page, '10I-1-ch3-empty-state');
  });

  test('보너스 · CH0 차단/종료 분기, 목록 에러', async ({ page }) => {
    await page.goto('/?screen=chat&scenario=gate-blocked');
    await shot(page, 'X-ch0-blocked');
    await page.goto('/?screen=chat&scenario=gate-ended');
    await shot(page, 'X-ch0-ended');
    await page.goto('/?screen=messages&scenario=list-error');
    await shot(page, 'X-ch1-list-error');
  });
});

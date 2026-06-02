/**
 * S13a 방 내부 채팅 (전체화면) — e2e-web (Playwright + RN-web 하네스).
 *
 * 프로덕션 view `RoomChatView` 를 실제 Chromium 에 마운트해 DOM 레벨로 검증한다.
 * 데이터는 하네스 fixture(e2e/harness/scenarios.ts) — Supabase/Docker 불필요.
 * 셀렉터는 testID/text/a11y-state 우선(NativeWind className 미컴파일).
 *
 * 커버: 전체화면 헤더(멤버수·아바타 스택, 시트 scrim 없음) / them·me·whisper 버블 /
 * 귓속말 보낸이 아바타+태그·방향 안내 없음 / @자동완성→칩 / 컴포저 글자수·전송게이트 /
 * 빈 상태 / 방 종료 읽기전용 / 컴포저 포커스 시 입력창 가림 없음(키보드 대체 검증).
 */
import { expect, test } from '@playwright/test';

test.describe('S13a 전체화면 헤더 & 기본 스트림', () => {
  test('전체화면: 멤버수 부제 + 컴포저, 바텀시트 scrim/surface 없음', async ({ page }) => {
    await page.goto('/?scenario=room-basic');

    await expect(page.getByTestId('room-chat-screen')).toBeVisible();
    // 방 제목 없이 '멤버 N명' 부제(active 4명).
    await expect(page.getByText('멤버 4명')).toBeVisible();
    await expect(page.getByTestId('input-bar-input')).toBeVisible();
    // 바텀시트가 아니다.
    await expect(page.getByTestId('bottom-sheet-surface')).toHaveCount(0);
    await expect(page.getByTestId('bottom-sheet-scrim')).toHaveCount(0);
  });

  test('them/me 버블 렌더', async ({ page }) => {
    await page.goto('/?scenario=room-basic');
    await expect(page.getByText('안녕하세요! 다들 어디서 일해요?')).toBeVisible();
    await expect(page.getByText('저도 합정! 카페 자주 가요')).toBeVisible();
  });
});

test.describe('S13a 귓속말', () => {
  test('받은 귓속말: 보낸이 이름 + 귓속말 태그, 방향 안내(→ 나에게) 없음', async ({ page }) => {
    await page.goto('/?scenario=whisper-received');
    await expect(page.getByText('우리 둘이 따로 보자')).toBeVisible();
    await expect(page.getByTestId('chat-bubble-whisper-tag').first()).toBeVisible();
    await expect(page.getByText(/나에게/)).toHaveCount(0);
  });

  test('내가 보낸 귓속말: 귓속말 태그 노출(본문 표시)', async ({ page }) => {
    await page.goto('/?scenario=whisper-sent');
    await expect(page.getByText('카페 추천해줘요')).toBeVisible();
    await expect(page.getByTestId('chat-bubble-whisper-tag').first()).toBeVisible();
  });
});

test.describe('S13a 멘션/귓속말 컴포저', () => {
  test('@입력 → 자동완성 후보 노출 → 탭하면 대상 칩 활성', async ({ page }) => {
    await page.goto('/?scenario=mention-active');
    // '@수' → 수아 후보 행.
    await expect(page.getByTestId('mention-row-u1')).toBeVisible();
    await page.getByTestId('mention-row-u1').click();
    // 칩 헤더 활성 + @쿼리 strip.
    await expect(page.getByTestId('input-bar-whisper-chip')).toBeVisible();
  });

  test('귓속말 칩 활성 시 × 탭으로 해제', async ({ page }) => {
    await page.goto('/?scenario=whisper-composing');
    await expect(page.getByTestId('input-bar-whisper-chip')).toBeVisible();
    await page.getByTestId('input-bar-whisper-clear').click();
    await expect(page.getByTestId('input-bar-whisper-chip')).toHaveCount(0);
  });
});

test.describe('S13a 컴포저 글자수/전송 게이트', () => {
  test('타이핑 시 글자수 카운터 갱신 + 전송 활성', async ({ page }) => {
    await page.goto('/?scenario=room-basic');
    const send = page.getByTestId('input-bar-send');
    // 빈 입력 → 전송 비활성.
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('input-bar-input').fill('안녕하세요');
    await expect(page.getByTestId('input-bar-charcount')).toHaveText('5 / 500');
    await expect(send).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('S13a 새 메시지 / 빈 상태 / 방 종료', () => {
  test('새 메시지 점프 pill', async ({ page }) => {
    await page.goto('/?scenario=new-messages');
    await expect(page.getByTestId('new-message-jump')).toBeVisible();
    await expect(page.getByText('↓ 3개 새 메시지')).toBeVisible();
  });

  test('빈 상태: 안내 + 컴포저 유지, 스트림 없음', async ({ page }) => {
    await page.goto('/?scenario=empty');
    await expect(page.getByText('아직 메시지가 없어요')).toBeVisible();
    await expect(page.getByTestId('input-bar-input')).toBeVisible();
    await expect(page.getByTestId('chat-stream')).toHaveCount(0);
  });

  test('방 종료: 스트림 보존 + 전송 비활성(읽기전용)', async ({ page }) => {
    await page.goto('/?scenario=room-ended');
    await expect(page.getByText('저도 합정! 카페 자주 가요')).toBeVisible();
    await expect(page.getByTestId('input-bar-send')).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('S13a 키보드(컴포저 가림 없음)', () => {
  test('입력창 포커스 후에도 입력창이 뷰포트 안에 보인다(가림 없음)', async ({ page }) => {
    await page.goto('/?scenario=room-basic');
    const input = page.getByTestId('input-bar-input');
    await input.focus();
    await input.fill('합정 카페 어디가 좋아요');
    await expect(input).toBeVisible();
    // 입력창 박스가 뷰포트 세로 범위 안(하단 밖으로 잘리지 않음).
    const box = await input.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  });
});

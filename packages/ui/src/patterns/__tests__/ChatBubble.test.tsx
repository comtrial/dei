import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatBubble } from '../ChatBubble';

describe('ChatBubble (X8)', () => {
  it('renders a "them" bubble with name, avatar and bg-2 surface (.s13a .msg)', () => {
    render(
      <ChatBubble testID="cb" variant="them" name="수아" avatarInitial="수">
        안녕하세요!
      </ChatBubble>,
    );
    expect(screen.getByTestId('cb')).toBeTruthy();
    expect(screen.getByText('수아')).toBeTruthy();
    expect(screen.getByText('안녕하세요!')).toBeTruthy();
    // avatar (28px) renders its initial
    expect(screen.getByText('수')).toBeTruthy();
    // row layout: flex-row gap-8 max-w-78%
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('flex-row');
    expect(row).toContain('max-w-[78%]');
    // bubble surface: bg-bg-2 + rounded-md
    const bubble = screen.getByText('안녕하세요!').props.className as string;
    expect(bubble).toContain('text-ink');
  });

  it('"me" bubble is ink + white, right-aligned, and hides the name (.msg.me)', () => {
    render(
      <ChatBubble testID="cb" variant="me" name="나">
        저도 합정!
      </ChatBubble>,
    );
    // me hides the name (.msg.me .nm{display:none})
    expect(screen.queryByText('나')).toBeNull();
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('self-end');
    const body = screen.getByText('저도 합정!').props.className as string;
    expect(body).toContain('text-white');
  });

  it('"whisper" bubble uses accent-soft + dashed accent border + italic and a 귓속말 suffix', () => {
    render(
      <ChatBubble testID="cb" variant="whisper" name="수아">
        카페 추천해줘요!
      </ChatBubble>,
    );
    // name gets the " → 귓속말" suffix (.nm::after)
    expect(screen.getByText('수아 → 귓속말')).toBeTruthy();
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('self-stretch');
    const body = screen.getByText('카페 추천해줘요!').props.className as string;
    expect(body).toContain('text-accent-deep');
    expect(body).toContain('italic');
  });

  it('"mention" renders an inline accent-700 token (.bub .mention)', () => {
    render(<ChatBubble variant="mention">@수아</ChatBubble>);
    const token = screen.getByText('@수아').props.className as string;
    expect(token).toContain('text-accent');
    expect(token).toContain('font-bold');
  });

  it('accepts node children so an inline mention can mix into a bubble', () => {
    render(
      <ChatBubble variant="them" name="민준" avatarInitial="민">
        <ChatBubble variant="mention">@수아</ChatBubble>
      </ChatBubble>,
    );
    expect(screen.getByText('@수아')).toBeTruthy();
    expect(screen.getByText('민준')).toBeTruthy();
  });

  it('me + failed: renders tappable retry "!" firing onRetry', () => {
    const onRetry = jest.fn();
    render(
      <ChatBubble testID="cb" variant="me" sendState="failed" onRetry={onRetry}>
        실패한 메시지
      </ChatBubble>,
    );
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('me + sending: bubble row carries reduced opacity', () => {
    render(
      <ChatBubble testID="cb" variant="me" sendState="sending">
        전송 중 메시지
      </ChatBubble>,
    );
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('opacity-60');
  });

  it('them is unaffected by sendState (no retry control)', () => {
    render(
      <ChatBubble testID="cb" variant="them" name="수아" avatarInitial="수" sendState="failed">
        상대 메시지
      </ChatBubble>,
    );
    expect(screen.queryByTestId('chat-bubble-retry')).toBeNull();
  });
});

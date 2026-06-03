import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatBubble, MentionToken } from '../ChatBubble';

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

  it('"whisper" (received) shows sender avatar + name + 귓속말 tag, accent-soft italic body, no 방향 접미', () => {
    render(
      <ChatBubble testID="cb" variant="whisper" name="수아" avatarInitial="수" avatarBg="bg-[#7A8DB8]">
        카페 추천해줘요!
      </ChatBubble>,
    );
    // 보낸이 이름 + '귓속말' 태그 (방향 접미/안내 없음)
    expect(screen.getByText('수아')).toBeTruthy();
    expect(screen.getByTestId('chat-bubble-whisper-tag')).toBeTruthy();
    expect(screen.queryByText(/→ 귓속말/)).toBeNull();
    expect(screen.queryByText(/나에게/)).toBeNull();
    // 보낸이 아바타(이니셜) 노출
    expect(screen.getByText('수')).toBeTruthy();
    // 버블 표면: accent-deep + italic 유지
    const body = screen.getByText('카페 추천해줘요!').props.className as string;
    expect(body).toContain('text-accent-deep');
    expect(body).toContain('italic');
  });

  it('"whisper" + mine: right-aligned, NO avatar, shows @recipient (not 귓속말 tag)', () => {
    render(
      // mine 일 때 name = 수신자 닉네임(누구에게 보냈는지)
      <ChatBubble testID="cb" variant="whisper" mine name="변경규" avatarInitial="나" avatarPhotoUrl="https://cdn.test/me.jpg">
        비밀 메시지
      </ChatBubble>,
    );
    const row = screen.getByTestId('cb').props.className as string;
    expect(row).toContain('self-end');
    // 내 메시지엔 아바타 없음(카톡)
    expect(screen.queryByTestId('av-photo')).toBeNull();
    // '귓속말' 태그 대신 수신자 @닉네임
    expect(screen.queryByTestId('chat-bubble-whisper-tag')).toBeNull();
    expect(screen.getByTestId('chat-bubble-whisper-target')).toBeTruthy();
    expect(screen.getByText('@변경규')).toBeTruthy();
    expect(screen.getByText('비밀 메시지')).toBeTruthy();
  });

  it('"whisper" + mine + failed: renders tappable retry firing onRetry (body-render-9)', () => {
    const onRetry = jest.fn();
    render(
      <ChatBubble testID="cb" variant="whisper" mine sendState="failed" name="변경규" onRetry={onRetry}>
        실패한 귓속말
      </ChatBubble>,
    );
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('"me" message shows no avatar even when avatarPhotoUrl is passed (카톡 — 내 메시지 아바타 없음)', () => {
    render(
      <ChatBubble testID="cb" variant="me" avatarPhotoUrl="https://cdn.test/me.jpg">
        내 메시지
      </ChatBubble>,
    );
    expect(screen.queryByTestId('av-photo')).toBeNull();
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

  it('passes avatarPhotoUrl through to the Avatar (them)', () => {
    render(
      <ChatBubble
        testID="cb"
        variant="them"
        name="수아"
        avatarPhotoUrl="https://cdn.test/u/sua.jpg"
      >
        안녕
      </ChatBubble>,
    );
    const img = screen.getByTestId('av-photo');
    expect(img.props.source).toEqual({ uri: 'https://cdn.test/u/sua.jpg' });
  });

  it('shows the avatar when only avatarPhotoUrl is given (no initial)', () => {
    render(
      <ChatBubble
        testID="cb"
        variant="them"
        name="수아"
        avatarPhotoUrl="https://cdn.test/u/sua.jpg"
      >
        안녕
      </ChatBubble>,
    );
    // avatar surfaced purely from photoUrl → photo element present
    expect(screen.getByTestId('av-photo')).toBeTruthy();
  });

  it('does not show an avatar when neither initial nor photoUrl is given (them)', () => {
    render(
      <ChatBubble testID="cb" variant="them" name="수아">
        안녕
      </ChatBubble>,
    );
    expect(screen.queryByTestId('av-photo')).toBeNull();
    expect(screen.queryByTestId('chat-bubble-avatar')).toBeNull();
  });

  it('wraps the avatar in a tappable button firing onAvatarPress', () => {
    const onAvatarPress = jest.fn();
    render(
      <ChatBubble
        testID="cb"
        variant="them"
        name="수아"
        avatarInitial="수"
        onAvatarPress={onAvatarPress}
      >
        안녕
      </ChatBubble>,
    );
    const btn = screen.getByLabelText('수아 프로필 보기');
    expect(btn.props.accessibilityRole).toBe('button');
    fireEvent.press(btn);
    expect(onAvatarPress).toHaveBeenCalledTimes(1);
  });

  it('does not wrap the avatar in a button when onAvatarPress is absent', () => {
    render(
      <ChatBubble testID="cb" variant="them" name="수아" avatarInitial="수">
        안녕
      </ChatBubble>,
    );
    expect(screen.queryByLabelText('수아 프로필 보기')).toBeNull();
    // initial avatar still renders
    expect(screen.getByText('수')).toBeTruthy();
  });

  it('MentionToken uses bright accent-soft on dark (me) context for contrast', () => {
    render(<MentionToken testID="mt" onDark>@수아</MentionToken>);
    const cls = screen.getByTestId('mt').props.className as string;
    // me(ink) 배경 대비 보정: text-accent 대신 밝은 accent-soft
    expect(cls).toContain('text-accent-soft');
    expect(cls).not.toContain('text-accent ');
    expect(cls).toContain('font-bold');
  });

  it('MentionToken keeps text-accent on light (them/whisper) context', () => {
    render(<MentionToken testID="mt">@수아</MentionToken>);
    const cls = screen.getByTestId('mt').props.className as string;
    expect(cls).toContain('text-accent');
    expect(cls).not.toContain('text-accent-soft');
  });
});

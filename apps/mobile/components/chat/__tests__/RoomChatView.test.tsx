import { fireEvent, render, screen } from '@testing-library/react-native';
import { RoomChatView } from '../RoomChatView';
import type { ChatMessage } from '@/lib/chat/message-merge';

const MSGS: ChatMessage[] = [
  { id: 's1', clientMsgId: null, userId: 'u1', body: '안녕하세요', whisperToUserId: null, createdAt: 't1', sendState: 'sent' },
  { id: 's2', clientMsgId: 'c2', userId: 'me', body: '반가워요', whisperToUserId: null, createdAt: 't2', sendState: 'failed' },
];
const MEMBERS = [
  { userId: 'u1', name: '수아', status: 'active' as const, avatarInitial: '수', photoUrl: 'https://cdn.test/u1.jpg' },
  { userId: 'u2', name: '민준', status: 'active' as const, avatarInitial: '민' },
];

function setup(overrides = {}) {
  const props = {
    roomName: '테스트 방', memberCount: 3, selfId: 'me',
    messages: MSGS, members: MEMBERS, input: '', whisperTarget: null,
    onChangeInput: jest.fn(), onSend: jest.fn(), onRetry: jest.fn(),
    onSelectMention: jest.fn(), onClearWhisper: jest.fn(), onAvatarPress: jest.fn(), onClose: jest.fn(),
    newCount: 0, onJump: jest.fn(), visible: true, ...overrides,
  };
  render(<RoomChatView {...props} />);
  return props;
}

describe('RoomChatView', () => {
  it('renders messages (them + me)', () => {
    setup();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('반가워요')).toBeTruthy();
  });

  it('failed me message shows retry firing onRetry with clientMsgId', () => {
    const props = setup();
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(props.onRetry).toHaveBeenCalledWith('c2');
  });

  it('shows mention panel when input ends with @ and a candidate tap fires onSelectMention', () => {
    const props = setup({ input: '@수' });
    fireEvent.press(screen.getByTestId('mention-row-u1'));
    expect(props.onSelectMention).toHaveBeenCalledWith(MEMBERS[0]);
  });

  it('whisper chip shows when whisperTarget set', () => {
    setup({ whisperTarget: { name: '수아', avatarInitial: '수' } });
    expect(screen.getByTestId('input-bar-whisper-chip')).toBeTruthy();
  });

  it('new message jump button visible when newCount>0', () => {
    const props = setup({ newCount: 2 });
    fireEvent.press(screen.getByTestId('new-message-jump'));
    expect(props.onJump).toHaveBeenCalled();
  });

  it('onScroll forwards contentOffset.y from the stream', () => {
    const onScroll = jest.fn();
    setup({ onScroll });
    fireEvent.scroll(screen.getByTestId('chat-stream'), {
      nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 800, width: 100 }, layoutMeasurement: { height: 400, width: 100 } },
    });
    expect(onScroll).toHaveBeenCalledWith(300);
  });

  it('jump press fires onJump even with stream scrolled (badge reset path)', () => {
    const props = setup({ newCount: 5, onScroll: jest.fn() });
    fireEvent.scroll(screen.getByTestId('chat-stream'), {
      nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 800, width: 100 }, layoutMeasurement: { height: 400, width: 100 } },
    });
    fireEvent.press(screen.getByTestId('new-message-jump'));
    expect(props.onJump).toHaveBeenCalledTimes(1);
  });

  // G-B: 본문 @토큰을 mention 노드(MentionToken=accent 볼드)로 렌더 — string 그대로 안 넘김.
  it('renders body @token as a highlighted mention node (not plain text)', () => {
    setup({
      messages: [
        { id: 's3', clientMsgId: null, userId: 'u1', body: '@민준 이거 봤어?', whisperToUserId: null, createdAt: 't3', sendState: 'sent' },
      ],
    });
    // 토크나이저가 '@민준' 조각과 ' 이거 봤어?' 조각으로 분해 → 각각 별도 Text 노드.
    expect(screen.getByText('@민준')).toBeTruthy();
    expect(screen.getByText(' 이거 봤어?')).toBeTruthy();
  });

  // body-render-9: 내가 보낸 귓속말 → 발신측 화면에서 '→ <대상>에게' + 우측정렬(me 처럼).
  it('my whisper bubble shows "→ <target>에게" sender label (right-aligned, not "me")', () => {
    setup({
      messages: [
        { id: 's4', clientMsgId: null, userId: 'me', body: '비밀 메시지', whisperToUserId: 'u2', createdAt: 't4', sendState: 'sent' },
      ],
    });
    expect(screen.getByText('→ 민준에게')).toBeTruthy();
    // 내 이름('나')으로는 안 떠야 한다(누가 보낸 게 아니라 누구에게 보냈는지).
    expect(screen.queryByText(/→ 귓속말/)).toBeNull();
  });

  // body-render-9: 남이 나에게 보낸 귓속말 → '<발신자> → 나에게'.
  it('incoming whisper to me shows "<sender> → 나에게"', () => {
    setup({
      messages: [
        { id: 's5', clientMsgId: null, userId: 'u1', body: '너만 알아', whisperToUserId: 'me', createdAt: 't5', sendState: 'sent' },
      ],
    });
    expect(screen.getByText('수아 → 나에게')).toBeTruthy();
  });

  // ★신규2: 아바타 탭 → onAvatarPress(메시지 발신자 userId).
  it('tapping a them-bubble avatar fires onAvatarPress with the message userId', () => {
    const props = setup({
      messages: [
        { id: 's6', clientMsgId: null, userId: 'u1', body: '안녕', whisperToUserId: null, createdAt: 't6', sendState: 'sent' },
      ],
    });
    fireEvent.press(screen.getByTestId('chat-bubble-avatar'));
    expect(props.onAvatarPress).toHaveBeenCalledWith('u1');
  });

  // ★신규1: 멤버 photoUrl 이 아바타 이미지로 전달(이니셜 대신 원형 이미지).
  it('passes member photoUrl through to the avatar image', () => {
    setup({
      messages: [
        { id: 's7', clientMsgId: null, userId: 'u1', body: '하이', whisperToUserId: null, createdAt: 't7', sendState: 'sent' },
      ],
    });
    expect(screen.getByTestId('av-photo')).toBeTruthy();
  });

  // F: 귓속말 칩이 떠 있어도 본문 새 @ 입력이면 후보 노출(대상 교체).
  it('shows mention candidates even with whisperTarget set (target swap)', () => {
    const props = setup({ whisperTarget: { userId: 'u1', name: '수아', avatarInitial: '수' }, input: '@민' });
    fireEvent.press(screen.getByTestId('mention-row-u2'));
    expect(props.onSelectMention).toHaveBeenCalledWith(MEMBERS[1]);
  });

  // roomEnded → 전송 비활성(composer disabled).
  it('disables send when roomEnded', () => {
    setup({ input: '안녕', roomEnded: true });
    const send = screen.getByTestId('input-bar-send');
    expect(send.props.accessibilityState?.disabled).toBe(true);
  });
});

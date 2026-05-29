import { fireEvent, render, screen } from '@testing-library/react-native';
import { RoomChatView } from '../RoomChatView';
import type { ChatMessage } from '@/lib/chat/message-merge';

const MSGS: ChatMessage[] = [
  { id: 's1', clientMsgId: null, userId: 'u1', body: '안녕하세요', whisperToUserId: null, createdAt: 't1', sendState: 'sent' },
  { id: 's2', clientMsgId: 'c2', userId: 'me', body: '반가워요', whisperToUserId: null, createdAt: 't2', sendState: 'failed' },
];
const MEMBERS = [
  { userId: 'u1', name: '수아', status: 'active' as const, avatarInitial: '수' },
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
});

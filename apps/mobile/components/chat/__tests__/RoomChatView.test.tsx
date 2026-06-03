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

  // S13a 재구성: 내가 보낸 귓속말 → 아바타 없음 + 수신자 @닉네임(방향 안내·태그 대신).
  it('my whisper bubble shows recipient @nickname (no avatar, no 귓속말 tag, no 방향 안내)', () => {
    setup({
      messages: [
        { id: 's4', clientMsgId: null, userId: 'me', body: '비밀 메시지', whisperToUserId: 'u2', createdAt: 't4', sendState: 'sent' },
      ],
    });
    expect(screen.getByText('비밀 메시지')).toBeTruthy();
    // 수신자(u2=민준) @닉네임 노출.
    expect(screen.getByText('@민준')).toBeTruthy();
    // '귓속말' 태그·방향 안내는 더 이상 없음.
    expect(screen.queryByTestId('chat-bubble-whisper-tag')).toBeNull();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  // S13a 재구성: 받은 귓속말 → 보낸이 이름 + '귓속말' 태그(방향 안내 제거).
  it('incoming whisper to me shows sender name + 귓속말 tag, no 방향 안내', () => {
    setup({
      messages: [
        { id: 's5', clientMsgId: null, userId: 'u1', body: '너만 알아', whisperToUserId: 'me', createdAt: 't5', sendState: 'sent' },
      ],
    });
    expect(screen.getByText('너만 알아')).toBeTruthy();
    expect(screen.getByText('수아')).toBeTruthy();
    expect(screen.getByTestId('chat-bubble-whisper-tag')).toBeTruthy();
    expect(screen.queryByText(/나에게/)).toBeNull();
  });

  // 전체화면 헤더: 방 제목 없이 '멤버 N명' 부제만.
  it('renders full-screen header with member count subtitle (no room title)', () => {
    setup({ memberCount: 8 });
    expect(screen.getByText('멤버 8명')).toBeTruthy();
  });

  // 전체화면: 바텀시트 scrim/surface 가 더 이상 없다.
  it('is a full screen — no bottom-sheet scrim/surface', () => {
    setup();
    expect(screen.queryByTestId('bottom-sheet-surface')).toBeNull();
    expect(screen.queryByTestId('bottom-sheet-scrim')).toBeNull();
    expect(screen.getByTestId('room-chat-screen')).toBeTruthy();
  });

  // 키보드: 컴포저가 KeyboardAvoidingView 안에 위치(키보드 위로 밀림).
  it('wraps the stream+composer in a KeyboardAvoidingView', () => {
    setup();
    expect(screen.getByTestId('room-chat-kav')).toBeTruthy();
    expect(screen.getByTestId('input-bar-input')).toBeTruthy();
  });

  // back 헤더 탭 → onClose.
  it('back control fires onClose', () => {
    const props = setup();
    fireEvent.press(screen.getByLabelText('뒤로'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // 빈 상태: 메시지 0건이면 안내 + 컴포저 유지.
  it('shows empty state with composer still present when no messages', () => {
    setup({ messages: [] });
    expect(screen.getByText('아직 메시지가 없어요')).toBeTruthy();
    expect(screen.getByTestId('input-bar-input')).toBeTruthy();
    expect(screen.queryByTestId('chat-stream')).toBeNull();
  });

  // blockedIds: 차단 멤버는 멘션 후보에서 제외(귓속말 누설 차단 경로 — 현재 미테스트).
  it('excludes a blocked member from mention candidates', () => {
    setup({ input: '@', blockedIds: new Set(['u1']) });
    // u1(수아)은 차단 → 후보 행 없음, u2(민준)은 노출.
    expect(screen.queryByTestId('mention-row-u1')).toBeNull();
    expect(screen.getByTestId('mention-row-u2')).toBeTruthy();
  });

  // 멘션 패널: @ 없거나 후보 0이면 미노출.
  it('hides mention panel when input has no active @ query', () => {
    setup({ input: '안녕하세요' });
    expect(screen.queryByTestId('mention-row-u1')).toBeNull();
    expect(screen.queryByTestId('mention-row-u2')).toBeNull();
  });

  // 내가 보낸 귓속말 실패 → 재시도(clientMsgId 전달).
  it('failed whisper-mine shows retry firing onRetry with clientMsgId', () => {
    const props = setup({
      messages: [
        { id: 'w9', clientMsgId: 'cw9', userId: 'me', body: '비밀', whisperToUserId: 'u1', createdAt: 't9', sendState: 'failed' },
      ],
    });
    fireEvent.press(screen.getByTestId('chat-bubble-retry'));
    expect(props.onRetry).toHaveBeenCalledWith('cw9');
  });

  // 키보드: 스트림이 작성 중 탭으로 키보드를 닫지 않도록 keyboardShouldPersistTaps='handled'.
  it('stream keeps keyboard on tap (keyboardShouldPersistTaps=handled)', () => {
    setup();
    expect(screen.getByTestId('chat-stream').props.keyboardShouldPersistTaps).toBe('handled');
  });

  // 오버레이 모드: 영상 위 dim scrim 렌더 / legacy 면 없음(피처 플래그 분기).
  it('renders a dim scrim only in overlay mode', () => {
    setup({ overlay: true });
    expect(screen.getByTestId('room-chat-scrim')).toBeTruthy();
  });

  it('no scrim in legacy mode (default)', () => {
    setup();
    expect(screen.queryByTestId('room-chat-scrim')).toBeNull();
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
  // u1(수아)은 photoUrl 보유 → 버블 아바타 + 헤더 AvatarStack 양쪽에 노출되므로 ≥1.
  it('passes member photoUrl through to the avatar image', () => {
    setup({
      messages: [
        { id: 's7', clientMsgId: null, userId: 'u1', body: '하이', whisperToUserId: null, createdAt: 't7', sendState: 'sent' },
      ],
    });
    expect(screen.getAllByTestId('av-photo').length).toBeGreaterThanOrEqual(1);
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

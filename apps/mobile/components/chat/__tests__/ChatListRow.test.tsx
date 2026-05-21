import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatListRow } from '../ChatListRow';
import type { ChatListItem } from '@/lib/chat/types';

const item: ChatListItem = {
  conversationId: 'conv-1',
  otherUserId: 'user-2',
  otherNickname: '민지',
  otherPhotoUrl: null,
  lastMessagePreview: '안녕하세요!',
  updatedAt: new Date().toISOString(),
  status: 'ACTIVE',
};

describe('ChatListRow (CH1 행)', () => {
  it('상대 닉네임과 마지막 메시지 미리보기를 렌더한다', () => {
    render(<ChatListRow item={item} onPress={jest.fn()} />);
    expect(screen.getByText('민지')).toBeTruthy();
    expect(screen.getByText('안녕하세요!')).toBeTruthy();
  });

  it('마지막 메시지가 없으면 안내 문구를 보여준다', () => {
    render(
      <ChatListRow
        item={{ ...item, lastMessagePreview: null }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('아직 메시지가 없어요')).toBeTruthy();
  });

  it('tap 시 onPress 에 해당 item 을 전달한다 (→ CH0 라우터)', () => {
    const onPress = jest.fn();
    render(<ChatListRow item={item} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('chat-list-row-conv-1'));
    expect(onPress).toHaveBeenCalledWith(item);
  });
});

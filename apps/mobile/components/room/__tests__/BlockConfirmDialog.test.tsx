/**
 * R7: BlockConfirmDialog 컴포넌트 테스트.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';
import { BlockConfirmDialog } from '../BlockConfirmDialog';

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    testID,
    onPress,
    disabled,
  }: {
    children: React.ReactNode;
    testID?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable } = require('react-native');
    return (
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        accessibilityState={{ disabled: !!disabled }}>
        {children}
      </Pressable>
    );
  },
}));

jest.mock('@/components/ui/text', () => ({
  Text: ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: RNText } = require('react-native');
    return <RNText>{children}</RNText>;
  },
}));

const MEMBER: RoomMemberWithProfile = {
  roomId: 'room-1',
  profileId: 'user-abc',
  status: 'active',
  joinedAt: new Date().toISOString(),
  leftAt: null,
  nickname: '홍길동',
  gender: 'M',
};

describe('BlockConfirmDialog (R7)', () => {
  it('renders nothing when member is null', () => {
    const { toJSON } = render(
      <BlockConfirmDialog member={null} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders dialog with member nickname', () => {
    render(
      <BlockConfirmDialog member={MEMBER} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByText('홍길동님을 차단할까요?')).toBeTruthy();
  });

  it('calls onConfirm when confirm button pressed', () => {
    const onConfirm = jest.fn();
    render(
      <BlockConfirmDialog member={MEMBER} onConfirm={onConfirm} onCancel={jest.fn()} />,
    );
    fireEvent.press(screen.getByTestId('room-block-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel pressed', () => {
    const onCancel = jest.fn();
    render(
      <BlockConfirmDialog member={MEMBER} onConfirm={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(screen.getByText('취소'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('marks button as disabled when busy', () => {
    render(
      <BlockConfirmDialog member={MEMBER} busy onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    const btn = screen.getByTestId('room-block-confirm-button');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });
});

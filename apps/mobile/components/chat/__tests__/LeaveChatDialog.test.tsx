import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LeaveChatDialog } from '../LeaveChatDialog';

// RNR Dialog 는 @rn-primitives/portal 로 콘텐츠를 렌더한다 → 테스트 트리에
// PortalHost 를 함께 마운트해야 다이얼로그 본문이 그려진다 (앱에서는 root
// _layout 의 <PortalHost /> 가 담당).
function renderWithPortal(ui: React.ReactElement) {
  return render(
    <>
      {ui}
      <PortalHost />
    </>,
  );
}

describe('LeaveChatDialog (CH5 나가기 확인)', () => {
  it('열렸을 때 확인 문구와 두 버튼을 렌더한다', () => {
    renderWithPortal(
      <LeaveChatDialog onCancel={jest.fn()} onConfirm={jest.fn()} open />,
    );
    expect(screen.getByText('대화에서 나가시겠어요?')).toBeTruthy();
    expect(
      screen.getByText('대화 내용이 영구 삭제되며 되돌릴 수 없습니다.'),
    ).toBeTruthy();
    expect(screen.getByTestId('leave-chat-confirm')).toBeTruthy();
    expect(screen.getByTestId('leave-chat-cancel')).toBeTruthy();
  });

  it('나가기 확정 tap → onConfirm (→ CH-API2)', () => {
    const onConfirm = jest.fn();
    renderWithPortal(
      <LeaveChatDialog onCancel={jest.fn()} onConfirm={onConfirm} open />,
    );
    fireEvent.press(screen.getByTestId('leave-chat-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('취소 tap → onCancel (→ CH2 유지)', () => {
    const onCancel = jest.fn();
    renderWithPortal(
      <LeaveChatDialog onCancel={onCancel} onConfirm={jest.fn()} open />,
    );
    fireEvent.press(screen.getByTestId('leave-chat-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pending 중에는 버튼 비활성', () => {
    const onConfirm = jest.fn();
    renderWithPortal(
      <LeaveChatDialog
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        open
        pending
      />,
    );
    fireEvent.press(screen.getByTestId('leave-chat-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('닫힌 상태에서는 본문을 렌더하지 않는다', () => {
    renderWithPortal(
      <LeaveChatDialog onCancel={jest.fn()} onConfirm={jest.fn()} open={false} />,
    );
    expect(screen.queryByText('대화에서 나가시겠어요?')).toBeNull();
  });
});

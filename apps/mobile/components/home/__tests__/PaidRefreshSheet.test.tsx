import { fireEvent, render } from '@testing-library/react-native';

import { PaidRefreshSheet } from '@/components/home/PaidRefreshSheet';

describe('PaidRefreshSheet', () => {
  const baseProps = {
    isOpen: true,
    onClose: jest.fn(),
    onDeveloperComplete: jest.fn(),
    onPurchase: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders load-more purchase copy as a matching ticket, not heart charge', () => {
    const { getAllByText, getByText, queryByText } = render(
      <PaidRefreshSheet
        {...baseProps}
        description="결제하면 새로운 3명을 이어서 볼 수 있어요"
        productLabel="신규 3명 매칭 이용권"
        title="신규 3명 매칭 이용권"
      />,
    );

    expect(getAllByText('신규 3명 매칭 이용권')).toHaveLength(2);
    expect(getByText('결제하면 새로운 3명을 이어서 볼 수 있어요')).toBeTruthy();
    expect(queryByText('하트 충전')).toBeNull();
    expect(queryByText('하트 1개')).toBeNull();
  });

  it('calls the developer completion handler from the bypass button', () => {
    const { getByText } = render(
      <PaidRefreshSheet {...baseProps} isDeveloperBypassEnabled />,
    );

    fireEvent.press(getByText('개발자 전용: 결제 완료 처리'));
    expect(baseProps.onDeveloperComplete).toHaveBeenCalledTimes(1);
  });
});

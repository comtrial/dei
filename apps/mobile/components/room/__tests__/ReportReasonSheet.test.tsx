/**
 * R8: ReportReasonSheet 컴포넌트 테스트.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReportReasonSheet } from '../ReportReasonSheet';

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

describe('ReportReasonSheet (R8)', () => {
  it('renders all 6 reason categories', () => {
    render(
      <ReportReasonSheet visible onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByTestId('room-report-reason-verbal_abuse')).toBeTruthy();
    expect(screen.getByTestId('room-report-reason-spam')).toBeTruthy();
    expect(screen.getByTestId('room-report-reason-fake_profile')).toBeTruthy();
    expect(screen.getByTestId('room-report-reason-inappropriate_video')).toBeTruthy();
    expect(screen.getByTestId('room-report-reason-harassment')).toBeTruthy();
    expect(screen.getByTestId('room-report-reason-other')).toBeTruthy();
  });

  it('submit button is disabled before selecting a reason', () => {
    render(
      <ReportReasonSheet visible onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    const submitBtn = screen.getByTestId('room-report-submit-button');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('calls onSubmit with correct code when reason selected and submitted', () => {
    const onSubmit = jest.fn();
    render(<ReportReasonSheet visible onSubmit={onSubmit} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('room-report-reason-spam'));
    fireEvent.press(screen.getByTestId('room-report-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith('spam', null);
  });

  it('calls onCancel when cancel pressed', () => {
    const onCancel = jest.fn();
    render(<ReportReasonSheet visible onSubmit={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(screen.getByText('취소'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

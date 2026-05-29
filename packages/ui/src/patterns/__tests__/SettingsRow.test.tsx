import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsRow } from '../SettingsRow';

describe('SettingsRow (X12)', () => {
  it('renders nav label + value (default variant)', () => {
    render(<SettingsRow label="닉네임" value="도현" />);
    expect(screen.getByText('닉네임')).toBeTruthy();
    expect(screen.getByText('도현')).toBeTruthy();
  });

  it('locked: value uses ink-4 and shows lock glyph', () => {
    render(<SettingsRow variant="locked" label="생년월일" value="2000.01.01" />);
    const value = screen.getByText('2000.01.01');
    expect((value.props.className as string) ?? '').toContain('text-ink-4');
    // 🔒 lock 글리프 노출
    expect(screen.getByText('🔒')).toBeTruthy();
  });

  it('danger: label uses danger color (S19 .row.danger .k)', () => {
    render(<SettingsRow variant="danger" label="계정 삭제" />);
    const label = screen.getByText('계정 삭제');
    expect((label.props.className as string) ?? '').toContain('text-danger');
  });

  it('master: renders title + description and toggles via Toggle', () => {
    const onToggleChange = jest.fn();
    render(
      <SettingsRow
        variant="master"
        label="전체 알림"
        value="모든 푸시 알림을 한 번에 관리해요"
        toggleValue={false}
        onToggleChange={onToggleChange}
      />,
    );
    expect(screen.getByText('전체 알림')).toBeTruthy();
    expect(screen.getByText('모든 푸시 알림을 한 번에 관리해요')).toBeTruthy();
    // 우측 Toggle(accessibilityRole switch) press → 다음 상태(true)
    fireEvent.press(screen.getByRole('switch'));
    expect(onToggleChange).toHaveBeenCalledWith(true);
  });

  it('member: renders avatar initial + name + sub (S15 .sBR .who)', () => {
    render(
      <SettingsRow variant="member" label="익명의 토끼" value="방금 전 입장" initial="익" />,
    );
    expect(screen.getByText('익')).toBeTruthy();
    expect(screen.getByText('익명의 토끼')).toBeTruthy();
    expect(screen.getByText('방금 전 입장')).toBeTruthy();
  });

  it('right slot overrides default chevron/toggle', () => {
    const { getByText } = render(
      <SettingsRow label="언어" right={<Text>커스텀</Text>} />,
    );
    expect(getByText('커스텀')).toBeTruthy();
  });
});

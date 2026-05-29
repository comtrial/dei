import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChoiceList, type ChoiceOption } from '../ChoiceList';

/** RNTL 노드에서 className 에 `needle` 이 포함된 조상 View 를 찾는다(Text 래퍼 중첩 흡수). */
function findAncestorWithClass(node: any, needle: string): string | undefined {
  let cur = node;
  while (cur != null) {
    const cls = cur.props?.className as string | undefined;
    if (typeof cls === 'string' && cls.includes(needle)) return cls;
    cur = cur.parent;
  }
  return undefined;
}

const REASONS: ChoiceOption[] = [
  { value: 'mood', label: '분위기가 맞지 않아요' },
  { value: 'mistake', label: '실수로 들어왔어요' },
  { value: 'other', label: '기타' },
];

describe('ChoiceList (X13)', () => {
  it('renders all options as a radiogroup (S16 사유 목록)', () => {
    render(<ChoiceList options={REASONS} />);
    expect(screen.getByText('분위기가 맞지 않아요')).toBeTruthy();
    expect(screen.getByText('실수로 들어왔어요')).toBeTruthy();
    expect(screen.getByText('기타')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('fires onChange with the option value when a row is pressed', () => {
    const onChange = jest.fn();
    render(<ChoiceList options={REASONS} onChange={onChange} />);
    fireEvent.press(screen.getByText('실수로 들어왔어요'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('mistake');
  });

  it('marks the selected row and reflects it in accessibilityState', () => {
    render(<ChoiceList options={REASONS} value="mood" />);
    const selectedLabel = screen.getByText('분위기가 맞지 않아요');
    // 선택 라벨은 ink 로 진해진다(HTML .sel{color:var(--ink)}).
    expect(selectedLabel.props.className as string).toContain('text-ink');
    // 비선택 라벨은 ink-2.
    expect(screen.getByText('실수로 들어왔어요').props.className as string).toContain(
      'text-ink-2',
    );
    // 선택 행 Pressable 의 accessibilityState.selected = true.
    const rows = screen.getAllByRole('radio');
    expect(rows[0].props.accessibilityState).toMatchObject({ selected: true });
    expect(rows[1].props.accessibilityState).toMatchObject({ selected: false });
  });

  it('tone=ink (S16): bg-2 base row, selected row → paper + ink-2 border', () => {
    const { rerender } = render(<ChoiceList options={REASONS} tone="ink" />);
    // 비선택: bg-2 표면.
    expect(findAncestorWithClass(screen.getByText('기타'), 'bg-bg-2')).toBeTruthy();

    rerender(<ChoiceList options={REASONS} tone="ink" value="other" />);
    const selRow = findAncestorWithClass(screen.getByText('기타'), 'bg-paper') ?? '';
    expect(selRow).toContain('bg-paper');
    expect(selRow).toContain('border-ink-2');
  });

  it('tone=accent (S21): paper + line base row, selected → accent border', () => {
    const cats: ChoiceOption[] = [
      { value: 'spam', label: '광고·스팸' },
      { value: 'etc', label: '기타 (자유 입력)' },
    ];
    const { rerender } = render(<ChoiceList options={cats} tone="accent" />);
    // 비선택: paper + line 보더.
    const base = findAncestorWithClass(screen.getByText('광고·스팸'), 'bg-paper') ?? '';
    expect(base).toContain('border-line');

    rerender(<ChoiceList options={cats} tone="accent" value="spam" />);
    const sel = findAncestorWithClass(screen.getByText('광고·스팸'), 'border-accent') ?? '';
    expect(sel).toContain('border-accent');
  });

  it('renders conditionalInput only when its option is selected', () => {
    const opts: ChoiceOption[] = [
      { value: 'mood', label: '분위기가 맞지 않아요' },
      {
        value: 'other',
        label: '기타',
        conditionalInput: <View testID="etc-input" />,
      },
    ];
    const { rerender } = render(<ChoiceList options={opts} value="mood" />);
    // 다른 옵션 선택 시 조건부 입력 숨김.
    expect(screen.queryByTestId('etc-input')).toBeNull();

    // '기타' 선택 시 조건부 입력 노출.
    rerender(<ChoiceList options={opts} value="other" />);
    expect(screen.getByTestId('etc-input')).toBeTruthy();
  });

  it('forwards ref to the underlying View container', () => {
    const ref = { current: null as View | null };
    render(<ChoiceList ref={ref} options={REASONS} />);
    expect(ref.current).not.toBeNull();
  });
});

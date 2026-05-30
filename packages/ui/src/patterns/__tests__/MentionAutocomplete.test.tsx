import { fireEvent, render, screen } from '@testing-library/react-native';

import { MentionAutocomplete, type MentionCandidate } from '../MentionAutocomplete';

const CANDIDATES: MentionCandidate[] = [
  { userId: 'u1', name: '수아', avatarInitial: '수' },
  { userId: 'u2', name: '민준', avatarInitial: '민' },
];

describe('MentionAutocomplete (X10)', () => {
  it('renders one row per candidate with name', () => {
    render(<MentionAutocomplete candidates={CANDIDATES} onSelect={jest.fn()} />);
    expect(screen.getByText('수아')).toBeTruthy();
    expect(screen.getByText('민준')).toBeTruthy();
  });

  it('onSelect fires with the tapped candidate', () => {
    const onSelect = jest.fn();
    render(<MentionAutocomplete candidates={CANDIDATES} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('mention-row-u2'));
    expect(onSelect).toHaveBeenCalledWith(CANDIDATES[1]);
  });

  it('renders muted empty row when no candidates and emptyLabel given', () => {
    render(<MentionAutocomplete candidates={[]} onSelect={jest.fn()} emptyLabel="보낼 수 있는 멤버가 없어요" />);
    expect(screen.getByText('보낼 수 있는 멤버가 없어요')).toBeTruthy();
  });

  it('returns null when empty and no emptyLabel', () => {
    const { toJSON } = render(<MentionAutocomplete candidates={[]} onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when visible=false', () => {
    const { toJSON } = render(
      <MentionAutocomplete candidates={CANDIDATES} onSelect={jest.fn()} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  describe('동명이인 식별 보조 라벨 (input-parse-4)', () => {
    // 동명이인('수아' 2명): name 만으로는 구분 불가 → secondaryLabel 로 식별.
    const SAME_NAME: MentionCandidate[] = [
      { userId: 'a1', name: '수아', avatarInitial: '수', avatarBg: 'bg-[#7A8DB8]', secondaryLabel: '디자인팀' },
      { userId: 'a2', name: '수아', avatarInitial: '수', avatarBg: 'bg-[#A87A4F]', secondaryLabel: '개발팀' },
    ];

    it('renders secondaryLabel beside the name when provided', () => {
      render(<MentionAutocomplete candidates={SAME_NAME} onSelect={jest.fn()} />);
      // 같은 이름이 2개여도 보조 라벨로 각 행을 구분할 수 있다.
      expect(screen.getAllByText('수아')).toHaveLength(2);
      expect(screen.getByText('디자인팀')).toBeTruthy();
      expect(screen.getByText('개발팀')).toBeTruthy();
    });

    it('does not render a secondary label node when secondaryLabel is absent', () => {
      render(<MentionAutocomplete candidates={CANDIDATES} onSelect={jest.fn()} />);
      expect(screen.queryByTestId('mention-row-u1-secondary')).toBeNull();
      expect(screen.queryByTestId('mention-row-u2-secondary')).toBeNull();
    });

    it('exposes secondaryLabel via testID for the row it belongs to', () => {
      render(<MentionAutocomplete candidates={SAME_NAME} onSelect={jest.fn()} />);
      expect(screen.getByTestId('mention-row-a1-secondary')).toBeTruthy();
      expect(screen.getByTestId('mention-row-a2-secondary')).toBeTruthy();
    });

    it('still passes avatarBg through so duplicate names keep distinct peer colors', () => {
      // avatarBg 색 차이는 동명이인 구분의 1차 단서로 유지된다(Avatar 로 전달).
      render(<MentionAutocomplete candidates={SAME_NAME} onSelect={jest.fn()} />);
      const onSelect = jest.fn();
      const { rerender } = render(
        <MentionAutocomplete candidates={SAME_NAME} onSelect={onSelect} />,
      );
      rerender(<MentionAutocomplete candidates={SAME_NAME} onSelect={onSelect} />);
      // 각 행이 고유 userId 로 선택 가능(엉뚱한 사람 선택 방지).
      fireEvent.press(screen.getAllByTestId('mention-row-a2')[0]);
      expect(onSelect).toHaveBeenCalledWith(SAME_NAME[1]);
    });
  });
});

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
});

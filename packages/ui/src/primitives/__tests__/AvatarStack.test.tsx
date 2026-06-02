import { render, screen } from '@testing-library/react-native';

import { AvatarStack } from '../AvatarStack';

describe('AvatarStack', () => {
  const items = [
    { userId: 'u1', initial: '수', bg: 'bg-[#7A8DB8]' },
    { userId: 'u2', initial: '민', bg: 'bg-[#7A6CB8]' },
    { userId: 'u3', initial: '지', bg: 'bg-[#A86B8A]' },
    { userId: 'u4', initial: '유', bg: 'bg-[#6BA88A]' },
  ];

  it('renders up to max avatars (default 3) and a +N overflow when exceeded', () => {
    render(<AvatarStack items={items} max={3} />);
    expect(screen.getByText('수')).toBeTruthy();
    expect(screen.getByText('민')).toBeTruthy();
    expect(screen.getByText('지')).toBeTruthy();
    // 4th hidden, overflow pill shows +1
    expect(screen.queryByText('유')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('renders all when count <= max with no overflow pill', () => {
    render(<AvatarStack items={items.slice(0, 2)} max={3} />);
    expect(screen.getByText('수')).toBeTruthy();
    expect(screen.getByText('민')).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('renders nothing meaningful for empty items (no pill, no avatar)', () => {
    render(<AvatarStack testID="stk" items={[]} />);
    expect(screen.getByTestId('stk')).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});

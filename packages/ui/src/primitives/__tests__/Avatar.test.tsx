import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Avatar, avatarColorFor } from '../Avatar';

describe('Avatar (P6)', () => {
  it('renders the initial centered inside a rounded-full View', () => {
    render(<Avatar testID="av" initial="수" />);
    const container = screen.getByTestId('av').props.className as string;
    expect(container).toContain('rounded-full');
    expect(container).toContain('items-center');
    expect(container).toContain('justify-center');
    expect(screen.getByText('수')).toBeTruthy();
  });

  it('applies size as square w/h arbitrary-value (S05 .av-me 38px)', () => {
    render(<Avatar testID="av" initial="수" size={38} />);
    const container = screen.getByTestId('av').props.className as string;
    expect(container).toContain('w-[38px]');
    expect(container).toContain('h-[38px]');
  });

  it('falls back to the §3A self bg when no bg prop is given', () => {
    render(<Avatar testID="av" initial="수" />);
    const container = screen.getByTestId('av').props.className as string;
    expect(container).toContain('bg-[#E07A4F]');
  });

  it('accepts a non-standard bg via prop (peer #7A8DB8)', () => {
    render(<Avatar testID="av" initial="J" bg="bg-[#7A8DB8]" />);
    const container = screen.getByTestId('av').props.className as string;
    expect(container).toContain('bg-[#7A8DB8]');
    expect(container).not.toContain('bg-[#E07A4F]');
  });

  it('ring adds an accent border (PresenceAvatar)', () => {
    render(<Avatar testID="av" initial="수" ring />);
    const container = screen.getByTestId('av').props.className as string;
    expect(container).toContain('border-accent');
  });

  it('presenceDot renders a paper-ringed accent dot', () => {
    render(<Avatar testID="av" initial="수" presenceDot />);
    const dot = screen.getByLabelText('접속 중');
    const cls = dot.props.className as string;
    expect(cls).toContain('bg-accent');
    expect(cls).toContain('border-paper');
    expect(cls).toContain('rounded-full');
  });

  it('hero size uses extrabold initial (S16 .hero-av 120px)', () => {
    render(<Avatar testID="av" initial="수" size={120} />);
    const label = screen.getByText('수').props.className as string;
    expect(label).toContain('font-extrabold');
    expect(label).toContain('text-white');
  });

  it('merges caller className (last wins via cn)', () => {
    render(<Avatar testID="av" initial="수" bg="bg-[#7A8DB8]" className="bg-accent" />);
    const container = screen.getByTestId('av').props.className as string;
    // tailwind-merge: 충돌 bg 는 caller className 이 승리.
    expect(container).toContain('bg-accent');
    expect(container).not.toContain('bg-[#7A8DB8]');
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(<Avatar ref={ref} testID="av" initial="수" />);
    expect(ref.current).not.toBeNull();
  });

  it('renders a circular Image when photoUrl is given (size-matched, no initial)', () => {
    render(<Avatar testID="av" initial="수" size={28} photoUrl="https://cdn.test/u/me.jpg" />);
    // photoUrl wins over the initial fallback — the letter is not rendered
    expect(screen.queryByText('수')).toBeNull();
    const img = screen.getByTestId('av-photo');
    expect(img.props.source).toEqual({ uri: 'https://cdn.test/u/me.jpg' });
    // image fills the circular container (size 28) and is clipped to a circle
    const cls = img.props.className as string;
    expect(cls).toContain('w-[28px]');
    expect(cls).toContain('h-[28px]');
    expect(cls).toContain('rounded-full');
  });

  it('caches the photo (memory-disk) + per-url recyclingKey for no-leadtime reloads', () => {
    render(<Avatar testID="av" photoUrl="https://cdn.test/u/me.jpg" />);
    const img = screen.getByTestId('av-photo');
    expect(img.props.cachePolicy).toBe('memory-disk');
    expect(img.props.recyclingKey).toBe('https://cdn.test/u/me.jpg');
  });

  it('avatarColorFor is deterministic and returns a peer bg token', () => {
    expect(avatarColorFor('user-1')).toBe(avatarColorFor('user-1'));
    expect(avatarColorFor('user-1')).toMatch(/^bg-\[#[0-9A-Fa-f]{6}\]$/);
  });

  it('falls back to the initial when photoUrl is not given', () => {
    render(<Avatar testID="av" initial="수" />);
    expect(screen.queryByTestId('av-photo')).toBeNull();
    expect(screen.getByText('수')).toBeTruthy();
  });

  it('keeps the accessibilityLabel when rendering a photo', () => {
    render(
      <Avatar testID="av" initial="수" photoUrl="https://cdn.test/u/me.jpg" accessibilityLabel="수아 아바타" />,
    );
    expect(screen.getByLabelText('수아 아바타')).toBeTruthy();
  });
});

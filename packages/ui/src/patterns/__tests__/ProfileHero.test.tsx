import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { ProfileHero } from '../ProfileHero';

describe('ProfileHero (X16)', () => {
  it('renders name, meta and initial fallback', () => {
    render(
      <ProfileHero name="도현" meta="24세 · 여성" initial="도" />,
    );
    expect(screen.getByText('도현')).toBeTruthy();
    expect(screen.getByText('24세 · 여성')).toBeTruthy();
    expect(screen.getByText('도')).toBeTruthy();
  });

  it('xl (default) avatar is 120px; lg is 90px (HTML .hero-av / .hero .av)', () => {
    const { rerender } = render(<ProfileHero initial="도" />);
    // 아바타 surface = accessibilityRole image View (testID 로 직접 조회).
    let box = screen.getByTestId('profile-hero-avatar');
    expect((box.props.className as string) ?? '').toContain('w-[120px]');
    expect((box.props.className as string) ?? '').toContain('h-[120px]');
    // 이니셜 글리프 48px (S16)
    expect((screen.getByText('도').props.className as string) ?? '').toContain(
      'text-[48px]',
    );

    rerender(<ProfileHero initial="도" size="lg" />);
    box = screen.getByTestId('profile-hero-avatar');
    expect((box.props.className as string) ?? '').toContain('w-[90px]');
    expect((box.props.className as string) ?? '').toContain('h-[90px]');
    expect((screen.getByText('도').props.className as string) ?? '').toContain(
      'text-[36px]',
    );
  });

  it('defaults avatar bg to neutral token bg-2 and initials to paper (white)', () => {
    render(<ProfileHero initial="도" />);
    expect((screen.getByTestId('profile-hero-avatar').props.className as string) ?? '').toContain(
      'bg-bg-2',
    );
    expect((screen.getByText('도').props.className as string) ?? '').toContain(
      'text-paper',
    );
  });

  it('seedClassName overrides avatar bg (per-user identity color via token/util)', () => {
    render(<ProfileHero initial="도" seedClassName="bg-accent" />);
    const cls = (screen.getByTestId('profile-hero-avatar').props.className as string) ?? '';
    expect(cls).toContain('bg-accent');
    // 중립 기본은 seed 가 대체.
    expect(cls).not.toContain('bg-bg-2');
  });

  it('ring=true adds accent ring border around the avatar', () => {
    render(<ProfileHero initial="도" ring />);
    const cls = (screen.getByTestId('profile-hero-avatar').props.className as string) ?? '';
    expect(cls).toContain('border-accent');
  });

  it('editable renders edit IconButton (ink bg, bg border) and fires onEditPress', () => {
    const onEditPress = jest.fn();
    render(
      <ProfileHero
        initial="도"
        size="lg"
        editable
        onEditPress={onEditPress}
        editAccessibilityLabel="프로필 사진 편집"
      />,
    );
    const edit = screen.getByLabelText('프로필 사진 편집');
    const cls = (edit.props.className as string) ?? '';
    // .edit: bg var(--ink) + border 2px solid var(--bg), 28×28 박스.
    expect(cls).toContain('bg-ink');
    expect(cls).toContain('border-bg');
    expect(cls).toContain('w-[28px]');
    // IconButton glass 기본 배경은 ink 로 덮였다(twMerge last-wins).
    expect(cls).not.toContain('bg-glass-dark');

    fireEvent.press(edit);
    expect(onEditPress).toHaveBeenCalledTimes(1);
  });

  it('does not render edit anchor when not editable', () => {
    render(<ProfileHero initial="도" />);
    expect(screen.queryByLabelText('프로필 사진 편집')).toBeNull();
  });

  it('has header accessibility role and forwards ref', () => {
    const ref = { current: null as View | null };
    render(<ProfileHero ref={ref} testID="hero" name="도현" />);
    expect(screen.getByTestId('hero').props.accessibilityRole).toBe('header');
    expect(ref.current).not.toBeNull();
  });
});

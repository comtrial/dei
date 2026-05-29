import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FullscreenVideo } from '../FullscreenVideo';

describe('FullscreenVideo (X11)', () => {
  it('renders on a #000 (bg-black) room surface (default playback)', () => {
    render(<FullscreenVideo />);
    const root = screen.getByTestId('fullscreen-video');
    expect(root).toBeTruthy();
    const className = root.props.className as string;
    expect(className).toContain('bg-black');
    expect(className).toContain('overflow-hidden');
  });

  it('falls back to a dark token placeholder when no video children given', () => {
    render(<FullscreenVideo />);
    const ph = screen.getByTestId('fullscreen-video-placeholder');
    // §3: 영상 placeholder 는 토큰 단색 폴백(bg-ink), raw gradient 금지.
    expect((ph.props.className as string)).toContain('bg-ink');
  });

  it('renders injected video children (expo-video/camera surface)', () => {
    render(
      <FullscreenVideo>
        <View testID="my-video" />
      </FullscreenVideo>,
    );
    expect(screen.getByTestId('my-video')).toBeTruthy();
    expect(screen.queryByTestId('fullscreen-video-placeholder')).toBeNull();
  });

  it('shows glass close button and fires onClose', () => {
    const onClose = jest.fn();
    render(<FullscreenVideo mode="preview" onClose={onClose} />);
    const close = screen.getByTestId('fullscreen-video-close');
    // glass variant → glass-dark 토큰 배경.
    expect((close.props.className as string)).toContain('bg-glass-dark');
    expect(screen.getByLabelText('닫기')).toBeTruthy();
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('viewfinder mode (S11)', () => {
    it('renders shutter (white circle + accent core) and segment indicator', () => {
      render(
        <FullscreenVideo
          mode="viewfinder"
          segments={3}
          segmentValue={1 / 3}
          onFlip={() => {}}
        />,
      );
      // 셔터: white 88 원 + accent core
      const shutter = screen.getByTestId('fullscreen-video-shutter');
      const shutterCn = shutter.props.className as string;
      expect(shutterCn).toContain('bg-white');
      expect(shutterCn).toContain('w-[88px]');
      // accent core 자식 존재 (ProgressBar 세그먼트 + core 둘 다 bg-accent 가능 → 셔터 영역 한정 확인)
      expect(screen.getByTestId('fullscreen-video-shutter-area')).toBeTruthy();
      // 세그먼트 인디케이터(ProgressBar segmented)
      expect(screen.getByTestId('fullscreen-video-indicator')).toBeTruthy();
      expect(screen.getByTestId('progressbar-segment-0')).toBeTruthy();
      // 플립 버튼(glass)
      expect(screen.getByTestId('fullscreen-video-flip')).toBeTruthy();
    });

    it('fires shutter press in/out (long-press record)', () => {
      const onIn = jest.fn();
      const onOut = jest.fn();
      render(
        <FullscreenVideo mode="viewfinder" onShutterPressIn={onIn} onShutterPressOut={onOut} />,
      );
      const shutter = screen.getByTestId('fullscreen-video-shutter');
      fireEvent(shutter, 'pressIn');
      fireEvent(shutter, 'pressOut');
      expect(onIn).toHaveBeenCalledTimes(1);
      expect(onOut).toHaveBeenCalledTimes(1);
    });

    it('renders the shutter hint copy', () => {
      render(<FullscreenVideo mode="viewfinder" />);
      expect(screen.getByText('길게 눌러서 녹화 · 최대 3초')).toBeTruthy();
    });
  });

  describe('preview mode (S11b)', () => {
    it('renders the duration badge (glass-dark) and bottom CTA slot', () => {
      render(
        <FullscreenVideo
          mode="preview"
          duration="● 2.3초"
          bottomSlot={<View testID="ctas" />}
        />,
      );
      expect(screen.getByText('● 2.3초')).toBeTruthy();
      const dur = screen.getByTestId('fullscreen-video-duration');
      // on-dark 국소색: black/55 불투명도 유틸 (raw hex 금지).
      expect((dur.props.className as string)).toBeTruthy();
      expect(screen.getByTestId('ctas')).toBeTruthy();
      // viewfinder 셔터는 preview 에 없어야 함.
      expect(screen.queryByTestId('fullscreen-video-shutter')).toBeNull();
    });
  });

  describe('playback mode (S13b)', () => {
    it('renders meta slot, white progress scrub bar and swipe hint', () => {
      render(
        <FullscreenVideo
          mode="playback"
          progress={0.55}
          metaSlot={<View testID="member-chip" />}
          swipeHint="‹ 다른 멤버 영상 ›"
        />,
      );
      expect(screen.getByTestId('member-chip')).toBeTruthy();
      // progress: white fill on white/20 track
      const progress = screen.getByTestId('fullscreen-video-progress');
      expect((progress.props.className as string)).toBeTruthy();
      const fill = screen.getByTestId('progressbar-fill');
      expect((fill.props.className as string)).toContain('bg-white');
      // swipe hint copy
      expect(screen.getByText('‹ 다른 멤버 영상 ›')).toBeTruthy();
      const hint = screen.getByTestId('fullscreen-video-swipe-hint');
      expect(hint).toBeTruthy();
    });

    it('fires onVideoPress (tap to pause toggle)', () => {
      const onVideoPress = jest.fn();
      render(<FullscreenVideo mode="playback" onVideoPress={onVideoPress} />);
      fireEvent.press(screen.getByTestId('fullscreen-video-surface'));
      expect(onVideoPress).toHaveBeenCalledTimes(1);
    });
  });

  it('forwards ref to the root view', () => {
    const ref = { current: null as View | null };
    render(<FullscreenVideo ref={ref} />);
    expect(ref.current).not.toBeNull();
  });

  it('merges caller className', () => {
    render(<FullscreenVideo className="rounded-xl" />);
    expect((screen.getByTestId('fullscreen-video').props.className as string)).toContain(
      'rounded-xl',
    );
  });
});

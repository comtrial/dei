import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { X, RefreshCw } from 'lucide-react-native';

import { cn } from '../lib/cn';
import { IconButton } from '../primitives/IconButton';
import { ProgressBar } from '../primitives/ProgressBar';
import { Badge } from '../primitives/Badge';
import { Text } from '../primitives/Text';

/**
 * FullscreenVideo (X11) — 영상 풀스크린 컨트롤 레이어.
 *
 * SSOT: all-screens 와이어프레임 `.s10`(촬영 viewfinder=S11) / `.s11b`(미리보기) /
 * `.s13b`(풀스크린 재생) CSS + 커버리지 매트릭스 X11 + ds-elements-extracted.json.
 *
 * 이 패턴은 **컨트롤 레이어 UI 만** 담당한다. 실제 영상 표면(expo-video /
 * expo-camera viewfinder)은 화면(스크린) 책임 — `children`(또는 `videoSlot`)
 * 으로 주입한다. 본 패턴은 `#000` 배경 위에 children 을 깔고 그 위로 mode 별
 * glass 오버레이 컨트롤을 절대 배치한다.
 *
 * mode
 *  - `viewfinder` (S11): 상단 닫기(glass)·플립(glass), 세그먼트 인디케이터(accent),
 *    하단 셔터(88 white + accent core) + 힌트. shutter / swipeHint 미사용 시 생략 가능.
 *  - `preview`    (S11b): 상단 닫기(glass) + 중앙 duration Badge, 하단 2-CTA 는
 *    화면이 BottomActionBar 로 합성(여기선 영역만 제공 — `bottomSlot`).
 *  - `playback`   (S13b): 상단 닫기(glass) + 멤버 meta chip(slot), 영상 진행 ProgressBar(white),
 *    하단 swipeHint.
 *
 * 색 규칙(DS D-04):
 *  - 배경 `#000` → `bg-black`(Tailwind 기본 토큰), glass 버튼 → IconButton `glass`(=glass-dark 토큰).
 *  - on-dark 화이트 텍스트/트랙은 `text-white`·`bg-white/NN` 불투명도 유틸로 표현(raw hex 금지).
 *  - 영상 placeholder gradient 는 §3 지침대로 "패턴 내부 장식 상수"(실데이터 시 children 으로 대체)
 *    → inline style 금지 위반을 피하기 위해 placeholder 도 토큰 className(`bg-ink`) 폴백만 둔다.
 *  - duration / meta / progress 오버레이의 `rgba(0,0,0,.45~.55)`·`rgba(255,255,255,.2~.45)` 는
 *    국소 on-dark 색 → `bg-black/45`·`bg-white/20` 등 불투명도 유틸(컴포넌트 국소색).
 */
export type FullscreenVideoMode = 'viewfinder' | 'preview' | 'playback';

export interface FullscreenVideoProps extends Omit<ViewProps, 'children'> {
  /** 컨트롤 레이어 모드. 기본 `playback`. */
  mode?: FullscreenVideoMode;
  /**
   * 실제 영상/카메라 표면. 화면(expo-video/expo-camera)이 주입한다.
   * 미지정 시 `#000` 만 남는다(컨트롤 레이어 단독).
   */
  children?: ReactNode;
  /** 상단 닫기(×) glass 버튼 핸들러. 미지정 시 닫기 버튼 비표시. */
  onClose?: () => void;
  /** 닫기 버튼 접근성 라벨. 기본 '닫기'. */
  closeLabel?: string;

  // ── viewfinder ──────────────────────────────────────────────
  /** (viewfinder) 카메라 전환 glass 버튼 핸들러. 미지정 시 비표시. */
  onFlip?: () => void;
  /** (viewfinder) 세그먼트 인디케이터 — 숫자(칸 수) 또는 채움 배열. */
  segments?: number | boolean[];
  /** (viewfinder) 세그먼트 채움 기준 진행률 0~1 (segments 가 숫자일 때). */
  segmentValue?: number;
  /**
   * (viewfinder) 셔터 표시 여부. 기본 viewfinder 일 때 true.
   * 셔터 누름(길게 눌러 녹화) 핸들러는 `onShutterPressIn`/`onShutterPressOut`.
   */
  shutter?: boolean;
  onShutterPressIn?: () => void;
  onShutterPressOut?: () => void;
  /** (viewfinder) 셔터 하단 힌트 카피. 기본 '길게 눌러서 녹화 · 최대 3초'. */
  shutterHint?: string;

  // ── preview ─────────────────────────────────────────────────
  /** (preview) 상단 중앙 녹화 길이 배지 라벨 (예: '● 2.3초'). 미지정 시 비표시. */
  duration?: ReactNode;
  /** (preview) 하단 CTA 영역(다시 찍기/올리기 등 BottomActionBar) slot. */
  bottomSlot?: ReactNode;

  // ── playback ────────────────────────────────────────────────
  /** (playback) 상단 우측 멤버 meta chip slot. */
  metaSlot?: ReactNode;
  /** (playback) 영상 재생 진행률 0~1 (white scrub bar). 미지정 시 진행바 비표시. */
  progress?: number;
  /** (playback) 영상 영역 탭(일시정지 토글 등) 핸들러. */
  onVideoPress?: () => void;

  /** 하단 swipe / 안내 힌트 카피 (playback 의 '‹ 다른 멤버 영상 ›' 등). */
  swipeHint?: ReactNode;

  className?: string;
}

/**
 * 영상 placeholder — children(실제 영상) 미주입 시의 다크 폴백.
 * HTML 은 mode 별 gradient placeholder(`#2a2520→#0e0a08` / `#4a3a6a→#1f1535`)지만
 * inline style 금지(D-04) + §3 "실데이터 시 이미지로 대체" 지침에 따라
 * 토큰 className(`bg-ink`) 단색 폴백만 둔다(장식 의미 없음).
 */
function VideoPlaceholder() {
  return <View testID="fullscreen-video-placeholder" className="absolute inset-0 bg-ink" />;
}

export const FullscreenVideo = forwardRef<View, FullscreenVideoProps>(function FullscreenVideo(
  {
    mode = 'playback',
    children,
    onClose,
    closeLabel = '닫기',
    onFlip,
    segments,
    segmentValue = 0,
    shutter,
    onShutterPressIn,
    onShutterPressOut,
    shutterHint = '길게 눌러서 녹화 · 최대 3초',
    duration,
    bottomSlot,
    metaSlot,
    progress,
    onVideoPress,
    swipeHint,
    className,
    ...rest
  },
  ref,
) {
  const showShutter = shutter ?? mode === 'viewfinder';

  return (
    <View
      ref={ref}
      testID="fullscreen-video"
      // #000 룸 배경. 컨트롤은 그 위로 absolute.
      className={cn('relative flex-1 overflow-hidden bg-black', className)}
      {...rest}
    >
      {/* ── 영상 표면(스크린 주입) / 폴백 ── */}
      {onVideoPress ? (
        <Pressable
          testID="fullscreen-video-surface"
          accessibilityRole="button"
          accessibilityLabel="영상"
          onPress={onVideoPress}
          className="absolute inset-0"
        >
          {children ?? <VideoPlaceholder />}
        </Pressable>
      ) : (
        <View className="absolute inset-0">{children ?? <VideoPlaceholder />}</View>
      )}

      {/* ── 상단 오버레이 바: 닫기 × (좌) / 플립(viewfinder) | meta(playback) (우) ── */}
      <View
        testID="fullscreen-video-top"
        className="absolute left-[18px] right-[18px] top-[18px] z-10 flex-row items-start justify-between"
      >
        {onClose ? (
          <IconButton
            testID="fullscreen-video-close"
            glyph={X}
            variant="glass"
            size={36}
            // .x: rgba(0,0,0,.45) on playback — glass(.4) 토큰으로 통일 (on-dark 대비 충분).
            accessibilityLabel={closeLabel}
            onPress={onClose}
          />
        ) : (
          <View />
        )}

        {mode === 'viewfinder' && onFlip ? (
          <IconButton
            testID="fullscreen-video-flip"
            glyph={RefreshCw}
            variant="glass"
            size={36}
            accessibilityLabel="카메라 전환"
            onPress={onFlip}
          />
        ) : null}

        {mode === 'playback' && metaSlot ? (
          <View testID="fullscreen-video-meta">{metaSlot}</View>
        ) : null}
      </View>

      {/* ── viewfinder: 세그먼트 인디케이터(상단, accent) ── */}
      {mode === 'viewfinder' && segments !== undefined ? (
        <View
          testID="fullscreen-video-indicator"
          className="absolute left-[60px] right-[60px] top-[80px] z-10 items-center"
        >
          <ProgressBar segmented={segments} value={segmentValue} />
        </View>
      ) : null}

      {/* ── preview: 상단 중앙 duration 배지(glass-dark .55) ── */}
      {mode === 'preview' && duration != null ? (
        <View
          testID="fullscreen-video-duration"
          className="absolute left-0 right-0 top-[18px] z-10 items-center"
        >
          {/* rgba(0,0,0,.55) blur(6) — on-dark 국소색 → black/55 불투명도 유틸. */}
          <Badge
            variant="count"
            className="rounded-full bg-black/55 px-[12px] py-[6px]"
            textClassName="text-[13px] font-semibold text-white"
          >
            {duration}
          </Badge>
        </View>
      ) : null}

      {/* ── playback: 영상 진행 스크럽 바(white fill on white/20) ── */}
      {mode === 'playback' && progress !== undefined ? (
        <View
          testID="fullscreen-video-progress"
          className="absolute left-[18px] right-[18px] top-[62px] z-10"
        >
          <ProgressBar
            value={progress}
            height={3}
            // track rgba(255,255,255,.2) / fill white — on-dark 국소색 불투명도 유틸.
            className="bg-white/20"
            fillClassName="bg-white"
          />
        </View>
      ) : null}

      {/* ── viewfinder: 하단 셔터 영역 ── */}
      {mode === 'viewfinder' && showShutter ? (
        <View
          testID="fullscreen-video-shutter-area"
          className="absolute bottom-[60px] left-0 right-0 z-10 items-center"
        >
          <Pressable
            testID="fullscreen-video-shutter"
            accessibilityRole="button"
            accessibilityLabel="녹화"
            onPressIn={onShutterPressIn}
            onPressOut={onShutterPressOut}
            // .shutter 88x88 white circle. ::after inset 8px accent core.
            className="h-[88px] w-[88px] items-center justify-center rounded-full bg-white"
          >
            <View className="absolute inset-[8px] rounded-full bg-accent" />
          </Pressable>
          {shutterHint ? (
            <Text
              variant="caption"
              // .shutter-hint 12px/500 white opacity .85 — on-dark 국소색.
              className="mt-[14px] text-[14px] font-medium text-white/85"
            >
              {shutterHint}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── preview: 하단 CTA 영역(BottomActionBar slot) ── */}
      {mode === 'preview' && bottomSlot ? (
        <View
          testID="fullscreen-video-bottom"
          className="absolute bottom-[32px] left-[24px] right-[24px] z-10"
        >
          {bottomSlot}
        </View>
      ) : null}

      {/* ── 하단 swipe / 안내 힌트 ── */}
      {swipeHint != null ? (
        <View
          testID="fullscreen-video-swipe-hint"
          className="absolute bottom-[28px] left-0 right-0 z-10 items-center"
        >
          <Text
            variant="micro"
            // .swipe-hint 11px/600 rgba(255,255,255,.45) — on-dark 국소색.
            className="text-[13px] font-semibold text-white/45"
          >
            {swipeHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

FullscreenVideo.displayName = 'FullscreenVideo';

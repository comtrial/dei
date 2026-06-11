import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type GestureResponderEvent,
} from 'react-native';

import { cn } from '../lib/cn';

/**
 * P18 — SlideToConfirm primitive.
 *
 * SSOT: all-screens 와이어프레임 `.sLR .slide`(S16 방 나가기) /
 * `.s20 .slide`(S20 회원 탈퇴) CSS + 커버리지 매트릭스 §P18.
 *
 * 비가역 파괴 액션(방 이탈·회원 탈퇴)을 "밀어서 확인" 제스처로 게이트해
 * 충동 실행을 막는 컨트롤. track(레일) + thumb(드래그 핸들) + arrows(방향
 * 힌트) + label(안내 카피) 합성.
 *
 * tone (HTML 의 두 출처를 그대로 분기):
 *  - `danger` : S20 `.s20 .slide` — danger-soft 레일 + danger 라벨, arrows 없음
 *  - `ink`    : S16 `.sLR .slide` — bg-2 레일 + ink-3 라벨 + ink-4 arrows(›››)
 * thumb 은 두 화면 공통으로 danger(원형) + white `→` 글리프.
 *
 * 색·크기는 전부 @dei/ui 토큰 className 으로만 표현(inline style / raw hex 금지,
 * DS D-04).
 *
 * --- 인터랙션 ---
 * `@dei/ui` 는 의존성 표면을 최소로 유지하므로(peer: react/react-native/
 * nativewind/lucide 만) 코어 RN responder handler 로 실제 thumb drag 를 처리한다.
 * 실제 동작 경로 = thumb 를 레일 끝까지 밀기(85% 이상) → `onConfirm`.
 * 길게 누르기는 접근성/테스트 보조 경로로만 남기고, 단순 탭은 confirm 하지 않는다.
 */
export type SlideToConfirmTone = 'danger' | 'ink';

export interface SlideToConfirmProps
  extends Omit<PressableProps, 'children' | 'style' | 'onLongPress' | 'onPress'> {
  /** 색 변형. 기본 `danger`(S20). `ink` = S16 방 나가기 레일. */
  tone?: SlideToConfirmTone;
  /** 레일 안내 카피. 미지정 시 tone 기본값(밀어서 확인하기). */
  label?: string;
  /** 슬라이드/길게누름 완료 시 호출 — 비가역 액션 실행 콜백. */
  onConfirm?: () => void;
  /** 방향 힌트 arrows(›››) 강제 표기/숨김. 미지정 시 tone 기본(ink만 노출). */
  showArrows?: boolean;
  /** 컨테이너 className 머지. */
  className?: string;
}

// thumb 글리프 — HTML 의 '→' / arrows '›››' 그대로.
const THUMB_GLYPH = '→';
const ARROWS_GLYPH = '›››';

// tone 기본 라벨 (HTML `.track` 텍스트).
const DEFAULT_LABEL: Record<SlideToConfirmTone, string> = {
  danger: '밀어서 탈퇴하기',
  ink: '밀어서 방 나가기',
};

// tone → 레일 배경 토큰 (S20 danger-soft / S16 bg-2).
const TRACK_BG: Record<SlideToConfirmTone, string> = {
  danger: 'bg-danger-soft',
  ink: 'bg-bg-2',
};

// tone → 라벨 색 토큰 (S20 danger 13px/700 / S16 ink-3 12.5px/700).
const LABEL_FG: Record<SlideToConfirmTone, string> = {
  danger: 'text-danger',
  ink: 'text-ink-3',
};

const THUMB_SIZE = 42;
const TRACK_PADDING = 6;
const DEFAULT_TRACK_WIDTH = 280;
const CONFIRM_THRESHOLD = 0.85;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const SlideToConfirm = forwardRef<View, SlideToConfirmProps>(
  function SlideToConfirm(
    {
      tone = 'danger',
      label,
      onConfirm,
      showArrows,
      className,
      testID,
      accessibilityState,
      ...pressableProps
    },
    ref,
  ) {
    const disabled = Boolean(pressableProps.disabled);
    const [trackWidth, setTrackWidth] = useState(DEFAULT_TRACK_WIDTH);
    const [dragX, setDragX] = useState(0);
    const dragXRef = useRef(0);
    const dragStartXRef = useRef(0);
    const confirmedRef = useRef(false);
    const text = label ?? DEFAULT_LABEL[tone];
    // arrows: 미지정 시 ink(S16) 만 노출 — S20 markup 엔 arrows 없음.
    const renderArrows = showArrows ?? tone === 'ink';
    const maxTranslate = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

    const setDrag = useCallback((next: number) => {
      const clamped = clamp(next, 0, maxTranslate);
      dragXRef.current = clamped;
      setDragX(clamped);
    }, [maxTranslate]);

    const confirm = useCallback(() => {
      if (disabled || confirmedRef.current) return;
      confirmedRef.current = true;
      setDrag(maxTranslate);
      onConfirm?.();
    }, [disabled, maxTranslate, onConfirm, setDrag]);

    useEffect(() => {
      if (disabled) return;
      confirmedRef.current = false;
      setDrag(0);
    }, [disabled, setDrag]);

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
      setTrackWidth(event.nativeEvent.layout.width || DEFAULT_TRACK_WIDTH);
    }, []);

    const eventPageX = useCallback((event: GestureResponderEvent) => {
      return event.nativeEvent.pageX ?? event.nativeEvent.locationX ?? 0;
    }, []);

    const handleDragStart = useCallback((event: GestureResponderEvent) => {
      dragStartXRef.current = eventPageX(event);
      setDrag(0);
    }, [eventPageX, setDrag]);

    const handleDragMove = useCallback((event: GestureResponderEvent) => {
      if (disabled || confirmedRef.current) return;
      setDrag(eventPageX(event) - dragStartXRef.current);
    }, [disabled, eventPageX, setDrag]);

    const handleDragRelease = useCallback((event: GestureResponderEvent) => {
      if (disabled || confirmedRef.current) return;
      const releasedX = clamp(eventPageX(event) - dragStartXRef.current, 0, maxTranslate);
      if (releasedX >= maxTranslate * CONFIRM_THRESHOLD) {
        confirm();
        return;
      }
      setDrag(0);
    }, [confirm, disabled, eventPageX, maxTranslate, setDrag]);

    // .slide 컨테이너: r-full, padding 6px, height 54px, overflow-hidden,
    // thumb/arrows 절대배치 기준이므로 relative.
    const containerClassName = cn(
      'relative h-[54px] flex-row items-center overflow-hidden rounded-full p-[6px]',
      TRACK_BG[tone],
      className,
    );

    return (
      <Pressable
        ref={ref}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || undefined, ...accessibilityState }}
        onLayout={handleLayout}
        // 단순 탭은 confirm 하지 않는다. 길게 누르기는 접근성 보조 경로.
        onLongPress={confirm}
        className={containerClassName}
        {...pressableProps}
      >
        {/* track 라벨 — 레일 정중앙. inset-[6px] 로 thumb 패딩과 정렬. */}
        <View
          pointerEvents="none"
          className="absolute inset-[6px] items-center justify-center rounded-full"
        >
          <Text
            testID={testID ? `${testID}-label` : undefined}
            className={cn(
              'text-[14.5px] font-bold tracking-[0.04em]',
              LABEL_FG[tone],
            )}
          >
            {text}
          </Text>
        </View>

        {/* thumb — 42x42 danger 원형 + white '→' (z 위로). */}
        <View
          testID={testID ? `${testID}-thumb` : undefined}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={handleDragStart}
          onResponderMove={handleDragMove}
          onResponderRelease={handleDragRelease}
          onResponderTerminate={() => {
            if (!confirmedRef.current) setDrag(0);
          }}
          className="z-10 h-[42px] w-[42px] items-center justify-center rounded-full bg-danger"
          style={dragX ? { transform: [{ translateX: dragX }] } : undefined}
        >
          <Text className="text-[18px] font-extrabold leading-none text-white">
            {THUMB_GLYPH}
          </Text>
        </View>

        {/* arrows — 우측 방향 힌트 ›››, ink-4 (S16 만). */}
        {renderArrows ? (
          <Text
            pointerEvents="none"
            testID={testID ? `${testID}-arrows` : undefined}
            className="absolute right-[18px] text-[15px] tracking-[-2px] text-ink-4"
          >
            {ARROWS_GLYPH}
          </Text>
        ) : null}
      </Pressable>
    );
  },
);

SlideToConfirm.displayName = 'SlideToConfirm';

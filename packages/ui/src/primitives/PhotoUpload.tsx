import { forwardRef } from 'react';
import {
  Image,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
  type PressableProps,
} from 'react-native';

import { cn } from '../lib/cn';

/**
 * PhotoUpload (P16) — 프로필 사진 업로드 프레임.
 *
 * SSOT: all-screens 와이어프레임 `.s04 .photo-up .frame`(140×180) + 커버리지
 * 매트릭스 §P16. 화면 S04b(프로필 2/3)에서 사용. 모든 시각 토큰은 `@dei/ui`
 * preset 의 className 으로만 표현한다 (raw hex / inline style / StyleSheet 금지, DS D-04).
 *
 * state
 *  - `empty`  : `bg-2` 표면 + `ink-4` 1.5px dashed 보더 + 중앙 플러스(📷) + 안내 라벨
 *  - `filled` : 업로드된 이미지(또는 placeholder) + `ink` solid 보더, 안내문 숨김
 *
 * `imageUri`(또는 `imageSource`) 가 있으면 그 이미지를 채우고, 없으면 §3 의 placeholder
 * 그라데이션 표면을 보여준다(실데이터 도착 시 이미지로 대체). `changePill` 이 true 면
 * 프레임 하단에 '변경' pill 을 띄운다.
 */
export type PhotoUploadState = 'empty' | 'filled';

export interface PhotoUploadProps extends Omit<PressableProps, 'children'> {
  /** 업로드 상태. 기본 `empty`. `imageUri`/`imageSource` 가 있으면 자동으로 filled 취급. */
  state?: PhotoUploadState;
  /** 채울 이미지 URI(원격/로컬). 지정 시 filled 로 렌더된다. */
  imageUri?: string;
  /** require() 등 정적 이미지 소스. `imageUri` 우선. */
  imageSource?: ImageSourcePropType;
  /** filled 상태에서 하단 '변경' pill 노출 여부. 기본 true(filled 일 때). */
  changePill?: boolean;
  /** '변경' pill 라벨. 기본 '변경'. */
  changeLabel?: string;
  /** empty 상태 중앙 글리프(이모지/문자). 기본 '📷'. */
  glyph?: string;
  /** empty 상태 안내 라벨. 기본 '지금 촬영'. */
  label?: string;
  className?: string;
}

/**
 * §3 처리: filled placeholder 그라데이션(HTML `linear-gradient(135deg,#d4a3b8,#7a5a8a)`)은
 * 의미 없는 1회성 장식(실데이터 시 이미지로 대체)이라 토큰화하지 않고 컴포넌트 국소 상수로 둔다.
 * NativeWind 는 그라데이션 className 을 지원하지 않으므로 단색 placeholder 표면 토큰으로 근사한다.
 */
const PLACEHOLDER_SURFACE = 'bg-bg-2';

// .photo-up .frame: 140×180, r-md, 중앙 정렬 column, gap 8, relative
const FRAME_BASE =
  'relative h-[180px] w-[140px] items-center justify-center gap-[8px] self-center overflow-hidden rounded-md';

// empty: bg-2 + 1.5px dashed ink-4
const FRAME_EMPTY = 'bg-bg-2 border-[1.5px] border-dashed border-ink-4';

// filled: solid ink 보더 (이미지/placeholder 표면은 안쪽에서 처리)
const FRAME_FILLED = 'border-[1.5px] border-solid border-ink';

export const PhotoUpload = forwardRef<View, PhotoUploadProps>(function PhotoUpload(
  {
    state,
    imageUri,
    imageSource,
    changePill,
    changeLabel = '변경',
    glyph = '📷',
    label = '지금 촬영',
    accessibilityLabel,
    className,
    ...rest
  },
  ref,
) {
  // imageUri/imageSource 가 있으면 filled 로 간주(명시 state 가 우선이되 이미지가 있으면 filled).
  const resolved: PhotoUploadState =
    state ?? (imageUri || imageSource ? 'filled' : 'empty');
  const isFilled = resolved === 'filled';
  const source: ImageSourcePropType | undefined = imageUri
    ? { uri: imageUri }
    : imageSource;
  // changePill 기본값: filled 일 때 true.
  const showPill = changePill ?? isFilled;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (isFilled ? changeLabel : label)}
      className={cn(FRAME_BASE, isFilled ? FRAME_FILLED : FRAME_EMPTY, className)}
      {...rest}
    >
      {isFilled ? (
        source ? (
          // 실데이터 이미지로 프레임을 채운다(절대 위치로 보더 안쪽 전면).
          <Image source={source} resizeMode="cover" className="absolute inset-0 h-full w-full" />
        ) : (
          // 이미지 미도착 시 §3 placeholder 표면.
          <View className={cn('absolute inset-0', PLACEHOLDER_SURFACE)} />
        )
      ) : (
        <>
          {/* .plus: 30px ink-3 글리프 */}
          <Text className="text-[30px] leading-none text-ink-3">{glyph}</Text>
          {/* .lbl: 12px ink-3 안내, 가운데 정렬 */}
          <Text className="px-[8px] text-center text-[14px] leading-[1.4] text-ink-3">
            {label}
          </Text>
        </>
      )}

      {showPill ? (
        // .change pill: 하단 -8px, paper bg, 1px line 보더, ink-2 10.5px/700, r-full
        <View className="absolute bottom-[-8px] left-1/2 -translate-x-1/2 rounded-full border border-line bg-paper px-[10px] py-[4px]">
          <Text className="text-[12.5px] font-bold text-ink-2">{changeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

PhotoUpload.displayName = 'PhotoUpload';

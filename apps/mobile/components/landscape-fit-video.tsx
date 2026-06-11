import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { VideoView, type VideoPlayer } from 'expo-video';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { logger } from '@dei/shared';

type StripSize = { w: number; h: number };
type VideoSize = { width: number; height: number };

type Props = Omit<ComponentProps<typeof VideoView>, 'contentFit' | 'style' | 'player'> & {
  player: VideoPlayer;
  /**
   * 현재 player 에 로드된 영상 URI. dim 감지용 thumbnail 추출에 사용.
   * iOS expo-video 의 videoTrack.size 는 raw storage 사이즈(sensor native landscape)
   * 라 portrait/landscape 구분이 안 됨 → thumbnail 의 displayed dim 으로 우회.
   */
  uri: string | null;
  /**
   * 영상 위에 같은 회전·크롭 컨텍스트로 같이 보여줄 overlay (e.g. thumbnail Image).
   * absoluteFillObject 로 채우면 회전 시 영상과 함께 회전됨.
   */
  overlay?: ReactNode;
};

/**
 * Setlog 스타일 — 영상을 portrait 화면 가운데 16:9 가로띠에 채움.
 *
 * - landscape 원본(16:9): 그대로 띠에 cover.
 * - portrait 원본(9:16): 90° 회전해서 띠에 정확히 fill (crop 없음, 내용 전부 보임).
 *
 * 회전 좌표: bbox 를 띠의 dim 을 swap 한 크기(h × w)로 만들고 center 가 띠 center
 * 와 일치하게 absolute offset (top, left) 으로 보정 → rotate 90° 후 정확히 띠 영역
 * 만 차지.
 */
export function LandscapeFitVideo({ player, uri, overlay, testID, ...rest }: Props) {
  const [videoSize, setVideoSize] = useState<VideoSize | null>(null);
  const [stripSize, setStripSize] = useState<StripSize | null>(null);

  useEffect(() => {
    if (!uri) {
      setVideoSize(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const thumb = await getThumbnailAsync(uri, { time: 0, quality: 0.1 });
        if (!cancelled) {
          setVideoSize({ width: thumb.width, height: thumb.height });
        }
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'landscape-fit-video', step: 'detect-orientation' },
          extra: { uri },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const isPortraitSource = !!videoSize && videoSize.height > videoSize.width;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStripSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
    );
  };

  return (
    <View
      style={{ width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' }}
      onLayout={handleLayout}
    >
      {isPortraitSource && stripSize ? (
        <View
          style={{
            position: 'absolute',
            width: stripSize.h,
            height: stripSize.w,
            top: (stripSize.h - stripSize.w) / 2,
            left: (stripSize.w - stripSize.h) / 2,
            transform: [{ rotate: '90deg' }],
          }}
        >
          <VideoView
            {...rest}
            testID={testID}
            player={player}
            contentFit="contain"
            style={StyleSheet.absoluteFillObject}
          />
          {overlay}
        </View>
      ) : (
        <View style={StyleSheet.absoluteFillObject}>
          <VideoView
            {...rest}
            testID={testID}
            player={player}
            contentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
          {overlay}
        </View>
      )}
    </View>
  );
}

/**
 * <VideoView> 마운트 직후 검은 화면이 보이는 것을 방지하기 위해 포스터(썸네일)를
 * 위에 겹쳐 그리는 합성 컴포넌트.
 *
 * 우선순위
 *   1) 서버 측 썸네일 (`posterUrl`) — 업로드 시 같이 저장된 정적 이미지
 *   2) 클라 즉석 추출 — `videoUrl` 의 첫 프레임을 캐시에 저장 (구 영상 호환)
 *   3) 둘 다 없으면 포스터 없이 그냥 <VideoView> 만 렌더 (기존 동작과 동일)
 *
 * 포스터 dismiss 시점
 *   `statusChange` 가 'readyToPlay' 가 되고 실제로 재생이 시작된 시점에 fade-out.
 *   재생이 잠시 멈춰도 (`pause()`, end 등) 포스터는 다시 띄우지 않는다 — 이미 한 번
 *   첫 프레임이 그려진 후라 검은 화면 위험이 없기 때문.
 */
import { useIsFocused } from '@react-navigation/native';
import { useEvent } from 'expo';
import { Image, type ImageContentFit } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getOrCreatePoster } from '@/lib/videoThumbnail';

// expo-video 의 VideoContentFit 은 라이브러리 외부로 노출 안 돼 있어 ImageContentFit 으로 통일
type ContentFit = ImageContentFit;

type Props = {
  player: VideoPlayer;
  /**
   * 서버 썸네일 URL (가장 신뢰됨, 가장 빠름). 없으면 클라 추출로 폴백.
   */
  posterUrl?: string | null;
  /**
   * 클라 측 추출에 사용할 원본 영상 URL. `posterUrl` 이 있으면 무시.
   */
  videoUrl?: string | null;
  /**
   * 포스터 캐시 키 (안정적 식별자, 예: storage path 또는 log_id).
   * 영상 URL 이 시간에 따라 변할 수 있는 경우 같은 키를 유지하기 위함.
   */
  posterCacheKey?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  nativeControls?: boolean;
  /**
   * 컴포넌트가 속한 스크린이 포커스를 잃으면 자동 pause. (default true)
   *
   * 다른 탭/스크린으로 이동했을 때 영상이 계속 재생되며 AVAudioSession 을 점유하면
   * record 화면의 카메라 (AVCaptureSession) 와 충돌해 카메라가 멈추는 문제가 있다.
   * 포커스 잃을 때 즉시 pause 해서 미디어 자원을 해제한다.
   */
  pauseWhenBlurred?: boolean;
  /**
   * 포커스 다시 받았을 때, 이전 blur 시점에 재생 중이었으면 자동으로 resume. (default true)
   *
   * "정지된 첫 프레임을 썸네일처럼 보여주는" 용도(예: SendLikeModal LogThumb) 는
   * `false` 로 설정해 의도된 정지 상태를 유지한다.
   */
  resumeOnFocus?: boolean;
};

export function VideoWithPoster({
  player,
  posterUrl,
  videoUrl,
  posterCacheKey,
  style,
  contentFit = 'cover',
  nativeControls = false,
  pauseWhenBlurred = true,
  resumeOnFocus = true,
}: Props) {
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const isScreenFocused = useIsFocused();

  const [posterFile, setPosterFile] = useState<string | null>(null);
  // 첫 프레임이 한 번이라도 그려졌으면 포스터를 다시 띄우지 않기 위한 latch
  const startedRef = useRef(false);
  // blur 직전에 재생 중이었는지 기억 (focus 복귀 시 resume 여부 판단)
  const wasPlayingRef = useRef(false);

  const hasServerPoster = !!posterUrl;

  // 서버 포스터가 없을 때만 클라 추출 시도
  useEffect(() => {
    if (hasServerPoster) {
      setPosterFile(null);
      return;
    }
    if (!videoUrl) {
      setPosterFile(null);
      return;
    }
    let alive = true;
    void getOrCreatePoster(videoUrl, posterCacheKey).then((file) => {
      if (alive) setPosterFile(file);
    });
    return () => {
      alive = false;
    };
  }, [hasServerPoster, videoUrl, posterCacheKey]);

  // source 가 바뀌면 (다른 영상으로 교체) 포스터를 다시 보여줘야 하므로 latch 리셋
  useEffect(() => {
    startedRef.current = false;
  }, [posterUrl, videoUrl, posterCacheKey]);

  // 화면 포커스를 잃을 때 즉시 pause + 이전 재생 상태 기록.
  // (record 진입 시 카메라 AVCaptureSession 과의 충돌 방지 + 배터리/CPU 절약)
  useEffect(() => {
    if (isScreenFocused) return;
    if (!pauseWhenBlurred) return;
    if (player.playing) {
      wasPlayingRef.current = true;
      try {
        player.pause();
      } catch {
        // expo-video player 가 이미 release 된 직후일 수 있음 — 무시
      }
    } else {
      wasPlayingRef.current = false;
    }
  }, [isScreenFocused, pauseWhenBlurred, player]);

  // 포커스 복귀 시 이전에 재생 중이었으면 자동 resume.
  useEffect(() => {
    if (!isScreenFocused) return;
    if (!resumeOnFocus) return;
    if (!wasPlayingRef.current) return;
    wasPlayingRef.current = false;
    try {
      player.play();
    } catch {
      // ignore — source 가 아직 미할당이거나 player release 된 케이스
    }
  }, [isScreenFocused, resumeOnFocus, player]);

  if (status === 'readyToPlay' && isPlaying) {
    startedRef.current = true;
  }

  const posterSource = hasServerPoster ? posterUrl : posterFile;
  const showPoster = !startedRef.current && !!posterSource;

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit as never}
        nativeControls={nativeControls}
      />
      {showPoster && posterSource ? (
        <Image
          source={{ uri: posterSource }}
          style={StyleSheet.absoluteFillObject}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={150}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

/**
 * 편의 hook — `useVideoPlayer` 와 동일 API 지만 인자가 캐시된 영상 URL 인 경우
 * file:// URI 그대로 사용. (별도 hooks/useCachedVideoSource 와 조합해 쓰면 된다)
 */
export function useVideoPosterPlayer(
  source: string | null | undefined,
  setup: (p: VideoPlayer) => void
): VideoPlayer {
  return useVideoPlayer(source ?? null, setup);
}

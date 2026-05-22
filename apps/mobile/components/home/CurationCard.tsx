import { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { Heart, UserRound, Volume2, VolumeX } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { VideoWithPoster } from '@/components/ui/VideoWithPoster';
import { getCachedVideoUri, prefetchVideo } from '@/lib/videoCache';
import type { CurationItem } from '@/hooks/useHomeScreen';

interface Props {
  item: CurationItem;
  isLikeUsed: boolean;
  isLiked: boolean;
  onLike: (userId: string) => void;
  onPress: (item: CurationItem) => void;
  onProfilePress?: (item: CurationItem) => void;
}

export function CurationCard({
  item,
  isLiked,
  isLikeUsed,
  onLike,
  onPress,
  onProfilePress,
}: Props) {
  const [muted, setMuted] = useState(true);
  const [videoIndex, setVideoIndex] = useState(0);

  const currentVideo = item.videos[videoIndex] ?? null;

  // 영상 N개 전부에 대해 캐시된 file:// URI 를 미리 해소.
  // - hit 면 player.replaceAsync 시점에 디스크에서 즉시 디코딩 시작 (네트워크 buffering X)
  // - miss 면 원본 https URL 로 우선 cycling + 백그라운드 prefetch (다음 사이클에 hit)
  const videosSignature = useMemo(
    () => item.videos.map((v) => `${v.logId}|${v.videoUrl}`).join(','),
    [item.videos]
  );
  const [resolvedUrls, setResolvedUrls] = useState<string[]>(() =>
    item.videos.map((v) => v.videoUrl)
  );

  useEffect(() => {
    let alive = true;
    setResolvedUrls(item.videos.map((v) => v.videoUrl));

    (async () => {
      const next = await Promise.all(
        item.videos.map(async (v) => {
          if (!v.videoUrl) return '';
          const cached = await getCachedVideoUri(v.videoUrl, v.logId);
          if (cached) return cached;
          void prefetchVideo(v.videoUrl, v.logId);
          return v.videoUrl;
        })
      );
      if (!alive) return;
      setResolvedUrls((prev) => {
        // 값이 동일하면 참조도 유지해 dep 가 무의미하게 invalidate 되지 않도록
        if (prev.length === next.length && prev.every((x, i) => x === next[i])) {
          return prev;
        }
        return next;
      });
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videosSignature]);

  // useVideoPlayer 의 dep 는 JSON.stringify(source) — source 변경 시 player 재생성된다.
  // 따라서 initial source 는 stable 한 원본 URL 로 두고, cached URI 활용은 cycling 시
  // replaceAsync 호출 시점으로 미룬다. (cached swap 으로 player 가 재생성되면 cycling
  // listener 가 끊기고 첫 영상이 중간에 reset 되는 부작용 발생)
  const firstVideoUrl = item.videos[0]?.videoUrl ?? null;
  const player = useVideoPlayer(firstVideoUrl, (p) => {
    p.loop = item.videos.length <= 1;
    p.muted = true;
    p.play();
  });

  // iOS 의 player.replace 는 main thread sync 라서 UI freeze (특히 "두 번째 영상이 멈춰서
  // 보이는" 증상의 직접 원인) → 가능하면 replaceAsync 사용.
  const replaceSource = (url: string): Promise<void> => {
    const playerAny = player as unknown as {
      replaceAsync?: (source: string) => Promise<void>;
    };
    if (typeof playerAny.replaceAsync === 'function') {
      return playerAny.replaceAsync(url);
    }
    player.replace(url);
    return Promise.resolve();
  };

  // replaceAsync resolve 시점에는 source swap 만 끝났고 디코더는 아직 'loading' 일 수
  // 있다. 그 상태에서 play() 를 호출하면 잠깐 isPlaying=true 가 됐다가 디코더 미준비로
  // 즉시 paused 로 떨어지고, 이후 'readyToPlay' 가 와도 자동 재생되지 않아 stuck 된다.
  // → status 가 'readyToPlay' 인 시점을 보장한 후 play() 호출한다.
  const playWhenReady = (): void => {
    const p = player as unknown as {
      status?: string;
      play: () => void;
      addListener: (
        event: 'statusChange',
        cb: (e: { status: string }) => void,
      ) => { remove: () => void };
    };
    if (p.status === 'readyToPlay') {
      p.play();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onceSub = p.addListener('statusChange', (event) => {
      if (event.status !== 'readyToPlay') return;
      onceSub.remove();
      if (timer) clearTimeout(timer);
      try {
        p.play();
      } catch {
        /* player 가 release 된 직후일 수 있음 */
      }
    });
    // 안전망: 5초 안에 readyToPlay 가 오지 않으면 (error 등) 한 번 더 시도
    timer = setTimeout(() => {
      onceSub.remove();
      try {
        p.play();
      } catch {
        /* ignore */
      }
    }, 5000);
  };

  // 유저가 바뀌면 인덱스만 리셋. useVideoPlayer 가 firstVideoUrl 변경을 자동으로 swap
  // 하므로 명시적 replace 는 불필요. (이전 구현은 명시적 replace + resolvedUrls dep 로
  // 인해 cache lookup 완료 시점에 한 번 더 0번째로 reset → 사용자가 본 "2번째 멈춤" 의
  // 원인이었음)
  useEffect(() => {
    setVideoIndex(0);
  }, [item.userId]);

  // 영상 1개: native loop / 영상 2개 이상: 종료 시점에 다음 영상으로 cycling.
  // 마지막(4번)에서 % 연산으로 0번째로 돌아간다 → 1→2→3→4→1 루프.
  useEffect(() => {
    if (item.videos.length <= 1) {
      player.loop = true;
      return;
    }
    player.loop = false;

    const sub = player.addListener('playToEnd', () => {
      setVideoIndex((prev) => {
        const next = (prev + 1) % item.videos.length;
        const url = resolvedUrls[next] ?? item.videos[next]?.videoUrl;
        if (!url) return next;

        void replaceSource(url).then(
          () => {
            // replaceAsync 가 source 를 swap 한 후 loop 가 reset 되는 케이스 방어 —
            // 다음에도 playToEnd 가 fire 하려면 loop=false 여야 한다.
            player.loop = false;
            player.muted = muted;
            // 디코더 readyToPlay 가 보장된 시점에 play (race-condition-free)
            playWhenReady();
          },
          () => {
            // fallback: sync replace (deprecation warning 감수)
            player.replace(url);
            player.loop = false;
            player.muted = muted;
            playWhenReady();
          },
        );
        return next;
      });
    });

    return () => sub.remove();
    // replaceSource/playWhenReady 는 매 렌더마다 새 함수지만 closure 가 최신
    // muted/resolvedUrls/player 를 참조하도록 dep 에 포함. listener churn 비용은 작다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, item.videos.length, resolvedUrls, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const infoLine1 = [item.displayName, item.age != null ? `${item.age}세` : null]
    .filter(Boolean)
    .join(' · ');
  const infoLine2 = item.region ?? null;
  const likeButtonClassName = isLiked
    ? 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-[#C0432A] items-center justify-center'
    : isLikeUsed
      ? 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-black/45 border border-white/25 items-center justify-center'
      : 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-black/45 border border-white/35 items-center justify-center';

  return (
    <TouchableOpacity
      className="flex-1 overflow-hidden"
      activeOpacity={0.95}
      onPress={() => onPress(item)}
    >
      <VideoWithPoster
        player={player}
        posterUrl={currentVideo?.thumbnailUrl ?? null}
        videoUrl={currentVideo?.videoUrl ?? null}
        posterCacheKey={currentVideo?.logId ?? null}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
      />

      {/* 영상 수 인디케이터 (2개 이상일 때만) */}
      {item.videos.length > 1 && (
        <View className="absolute top-2 left-0 right-0 flex-row justify-center gap-1 px-2">
          {item.videos.map((_, i) => (
            <View
              key={i}
              className={`h-0.5 flex-1 rounded-full ${i === videoIndex ? 'bg-white' : 'bg-white/35'}`}
            />
          ))}
        </View>
      )}

      {/* 좌하단 닉네임 · 나이 / 지역 */}
      <View className="absolute left-2.5 bottom-2 bg-black/45 rounded-md px-2 py-1">
        <Text className="text-white text-xs font-semibold">{infoLine1}</Text>
        {infoLine2 ? (
          <Text className="text-white/65 text-[10px] mt-0.5">{infoLine2}</Text>
        ) : null}
      </View>

      {onProfilePress ? (
        <TouchableOpacity
          accessibilityLabel="프로필 보기"
          className="absolute right-2.5 top-2.5 h-8 w-8 items-center justify-center rounded-full bg-black/50"
          onPress={(event) => {
            event.stopPropagation();
            onProfilePress(item);
          }}
          activeOpacity={0.8}
        >
          <UserRound size={14} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* 우하단 음소거 토글 */}
      <TouchableOpacity
        className="absolute right-2.5 bottom-2 w-7 h-7 rounded-full border border-white/35 items-center justify-center"
        onPress={toggleMute}
        activeOpacity={0.8}
      >
        {muted ? (
          <VolumeX size={13} color="rgba(255,255,255,0.9)" />
        ) : (
          <Volume2 size={13} color="rgba(255,255,255,0.9)" />
        )}
      </TouchableOpacity>

      {/* 좋아요 버튼 */}
      <TouchableOpacity
        accessibilityLabel={isLiked ? '좋아요 보냄' : '좋아요 보내기'}
        accessibilityState={{ selected: isLiked }}
        className={likeButtonClassName}
        onPress={(event) => {
          event.stopPropagation();
          onLike(item.userId);
        }}
        activeOpacity={0.8}
        testID={isLiked ? 'curation-like-button-liked' : 'curation-like-button-idle'}
      >
        <Heart
          size={14}
          color={isLikeUsed && !isLiked ? 'rgba(255,255,255,0.7)' : '#fff'}
          fill={isLiked ? '#fff' : 'transparent'}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

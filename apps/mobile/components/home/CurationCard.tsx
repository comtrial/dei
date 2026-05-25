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
  // ping-pong 두 player 중 어느 쪽이 현재 화면에 보이는지. cycling 마다 토글된다.
  //   active   : VideoView 에 표시되는 player. 지금 재생 중.
  //   inactive : 화면에 안 보이는 백그라운드 player. **다음 영상을 미리 load 해서
  //              readyToPlay 상태로 대기** — playToEnd 순간에 즉시 표시 가능 (디코더
  //              warm). replaceAsync 후 readyToPlay 까지의 100~300ms gap 이 사라진다.
  const [activeKey, setActiveKey] = useState<'a' | 'b'>('a');

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
  // playerA: 진입 시 첫 영상을 자동 재생. 처음에는 이게 active.
  const playerA = useVideoPlayer(firstVideoUrl, (p) => {
    p.loop = item.videos.length <= 1;
    p.muted = true;
    p.play();
  });
  // playerB: 워밍업 전용 (보이지 않음). source=null 로 시작해서 useEffect 가 다음 영상을
  // replaceAsync 로 채운다. setup 에서 play 호출 안 함 — swap 시점에만 play 한다.
  const playerB = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const activePlayer = activeKey === 'a' ? playerA : playerB;
  const inactivePlayer = activeKey === 'a' ? playerB : playerA;

  // iOS 의 player.replace 는 main thread sync 라서 UI freeze (특히 "두 번째 영상이 멈춰서
  // 보이는" 증상의 직접 원인) → 가능하면 replaceAsync 사용.
  const replaceSourceOn = (
    p: typeof playerA,
    url: string,
  ): Promise<void> => {
    const playerAny = p as unknown as {
      replaceAsync?: (source: string) => Promise<void>;
    };
    if (typeof playerAny.replaceAsync === 'function') {
      return playerAny.replaceAsync(url);
    }
    p.replace(url);
    return Promise.resolve();
  };

  // replaceAsync resolve 시점에는 source swap 만 끝났고 디코더는 아직 'loading' 일 수
  // 있다. 그 상태에서 play() 를 호출하면 잠깐 isPlaying=true 가 됐다가 디코더 미준비로
  // 즉시 paused 로 떨어지고, 이후 'readyToPlay' 가 와도 자동 재생되지 않아 stuck 된다.
  // → status 가 'readyToPlay' 인 시점을 보장한 후 play() 호출한다.
  const playWhenReady = (player: typeof playerA): void => {
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

  // 유저가 바뀌면 (다른 큐레이션 카드로 스크롤) 인덱스와 active 를 모두 리셋.
  // playerA 는 useVideoPlayer 가 firstVideoUrl 변경을 자동으로 swap 해주므로 그대로 'a'.
  useEffect(() => {
    setVideoIndex(0);
    setActiveKey('a');
  }, [item.userId]);

  // **inactive player 워밍업**: 현재 표시되는 영상이 재생되는 동안 inactive 에 다음 영상을
  // 미리 load 시켜 readyToPlay 까지 진행한다. 그러면 playToEnd 시점에 swap 만 하면
  // 디코더 ready 상태이므로 멈춤 없이 즉시 재생된다.
  useEffect(() => {
    if (item.videos.length <= 1) return;
    const nextIndex = (videoIndex + 1) % item.videos.length;
    const nextUrl = resolvedUrls[nextIndex] ?? item.videos[nextIndex]?.videoUrl;
    if (!nextUrl) return;

    void replaceSourceOn(inactivePlayer, nextUrl).catch(() => {
      // 워밍업 실패해도 swap 시점에 다시 시도되므로 silent ignore.
    });
    // play 호출은 X — 화면에 안 보이는 player 가 소리/재생을 시작하면 안 됨.
    // expo-video 는 replaceAsync 만으로 디코더를 readyToPlay 까지 prepare 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoIndex, activeKey, resolvedUrls, item.videos.length]);

  // 영상 1개: native loop / 영상 2개 이상: 종료 시점에 ping-pong swap.
  // active 의 playToEnd → inactive 를 play (이미 ready 상태) → activeKey 토글 →
  // 위 useEffect 가 새 inactive 에 그 다음 영상 워밍업 시작.
  useEffect(() => {
    if (item.videos.length <= 1) {
      activePlayer.loop = true;
      return;
    }
    activePlayer.loop = false;

    const sub = activePlayer.addListener('playToEnd', () => {
      // 새로 보일 player (현재 inactive). 워밍업 useEffect 가 이미 다음 영상을 load
      // 시켜놨을 것 — readyToPlay 면 즉시 play, 아니면 listener 로 보장.
      inactivePlayer.loop = false;
      inactivePlayer.muted = muted;
      playWhenReady(inactivePlayer);

      // 기존 active 는 다음 사이클을 위해 잠시 쉰다. (다음 useEffect 가 새 inactive 가
      // 된 이 player 에 또 그 다음 영상을 워밍업 load 시킬 것)
      try {
        activePlayer.pause();
      } catch {
        // ignore
      }

      // 화면 swap + index 진행을 같은 commit 에서 처리.
      setActiveKey((k) => (k === 'a' ? 'b' : 'a'));
      setVideoIndex((prev) => (prev + 1) % item.videos.length);
    });

    return () => sub.remove();
    // muted/inactivePlayer/activePlayer 변경 시 listener 재등록. churn 비용 작음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer, inactivePlayer, item.videos.length, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    activePlayer.muted = next;
    // inactive 는 어차피 재생 안 하지만 swap 직후 muted 상태가 따라오도록 같이 동기화.
    inactivePlayer.muted = next;
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
        player={activePlayer}
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

import { useRouter } from 'expo-router';

import { HomeTopBar } from '@/components/home/HomeTopBar';
import { HomeTopVariantB } from '@/components/home/HomeTopVariantB';
import { HomeTopVariantC } from '@/components/home/HomeTopVariantC';
import { ROUTES } from '@/lib/routes';
import { useFeatureFlag } from '@/providers/feature-flags-provider';

type StatItem = { label: string; value: number; delta?: number };

type Props = {
  heartCount?: number;
  refreshItemCount?: number;
  daysSinceVideo?: number | null;
  stats?: StatItem[];
  /** 내 프로필 사진 (signed URL). variant B/C 우측 상단 프로필에 표시. */
  myPhotoUrl?: string | null;
  /** 내 최근 영상 썸네일 (signed URL). variant B/C 카드 썸네일에 표시. */
  myLatestVideoThumbUrl?: string | null;
};

/**
 * 홈 상단 영역 — feature flag `home_top_layout` 으로 variant 선택.
 *   A(기본) 무압박: 로고+하트+프로필 (HomeTopBar)
 *   B 모멘텀: 반응 통계 카드 (HomeTopVariantB)
 *   C 리프레시: 압박 카드 (HomeTopVariantC)
 * flag 미설정/로드 전엔 A 로 안전 fallback.
 */
export function HomeTopBarSlot({
  heartCount,
  refreshItemCount,
  daysSinceVideo,
  stats,
  myPhotoUrl,
  myLatestVideoThumbUrl,
}: Props) {
  const router = useRouter();
  const variant = useFeatureFlag('home_top_layout', 'A');

  const goRecord = () => router.push(ROUTES.record as never);
  const goProfile = () => router.push(ROUTES.myProfile as never);

  if (variant === 'B') {
    return (
      <HomeTopVariantB
        heartCount={heartCount}
        refreshItemCount={refreshItemCount}
        daysSinceVideo={daysSinceVideo}
        stats={stats}
        myPhotoUrl={myPhotoUrl}
        myLatestVideoThumbUrl={myLatestVideoThumbUrl}
        onSeeResults={goProfile}
        onRecordMore={goRecord}
      />
    );
  }
  if (variant === 'C') {
    return (
      <HomeTopVariantC
        heartCount={heartCount}
        refreshItemCount={refreshItemCount}
        daysSinceVideo={daysSinceVideo}
        myPhotoUrl={myPhotoUrl}
        myLatestVideoThumbUrl={myLatestVideoThumbUrl}
        onRecordNew={goRecord}
      />
    );
  }
  return <HomeTopBar heartCount={heartCount} refreshItemCount={refreshItemCount} />;
}

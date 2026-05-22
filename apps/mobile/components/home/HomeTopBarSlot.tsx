import { useRouter } from 'expo-router';

import { HomeTopBar } from '@/components/home/HomeTopBar';
import { HomeTopVariantB } from '@/components/home/HomeTopVariantB';
import { HomeTopVariantC } from '@/components/home/HomeTopVariantC';
import { ROUTES } from '@/lib/routes';
import { useFeatureFlag } from '@/providers/feature-flags-provider';

type StatItem = { label: string; value: number; delta?: number };

type Props = {
  heartCount?: number;
  daysSinceVideo?: number | null;
  stats?: StatItem[];
};

/**
 * 홈 상단 영역 — feature flag `home_top_layout` 으로 variant 선택.
 *   A(기본) 무압박: 로고+하트+프로필 (HomeTopBar)
 *   B 모멘텀: 반응 통계 카드 (HomeTopVariantB)
 *   C 리프레시: 압박 카드 (HomeTopVariantC)
 * flag 미설정/로드 전엔 A 로 안전 fallback.
 */
export function HomeTopBarSlot({ heartCount, daysSinceVideo, stats }: Props) {
  const router = useRouter();
  const variant = useFeatureFlag('home_top_layout', 'A');

  const goRecord = () => router.push(ROUTES.record as never);
  const goProfile = () => router.push(ROUTES.myProfile as never);

  if (variant === 'B') {
    return (
      <HomeTopVariantB
        daysSinceVideo={daysSinceVideo}
        stats={stats}
        onSeeResults={goProfile}
        onRecordMore={goRecord}
      />
    );
  }
  if (variant === 'C') {
    return (
      <HomeTopVariantC daysSinceVideo={daysSinceVideo} onRecordNew={goRecord} onLater={() => {}} />
    );
  }
  return <HomeTopBar heartCount={heartCount} />;
}

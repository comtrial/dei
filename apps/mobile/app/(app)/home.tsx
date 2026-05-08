import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { B2Banner } from '@/components/home/B2Banner';
import { CurationCard } from '@/components/home/CurationCard';
import { H3EmptyContent } from '@/components/home/H3EmptyContent';
import { HomeTopBar } from '@/components/home/HomeTopBar';
import { PaidRefreshSheet } from '@/components/home/PaidRefreshSheet';
import { PaymentFailureDialog } from '@/components/home/PaymentFailureDialog';
import { VideoModal } from '@/components/home/VideoModal';
import type { CurationItem } from '@/hooks/useHomeScreen';
import { Text } from '@/components/ui/text';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { useLike } from '@/hooks/useLike';
import { isLocalDevPaymentEnabled } from '@/lib/dev-auth';
import {
  getRefreshOfferingInfo,
  isRevenueCatPurchaseCancelled,
  purchaseRefreshItem,
} from '@/lib/refresh-purchase';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export default function HomeScreen() {
  const { user } = useAuth();
  const {
    screen,
    pages,
    currentPool,
    logProgress,
    noonBanner,
    handleDeveloperPaidRefresh,
    handlePaidRefresh,
    handleRefresh,
    handleNoonRefresh,
    dismissNoonBanner,
  } = useHomeScreen(user?.id);

  const { likeUsed, checkLikeUsed, sendLike } = useLike(user?.id);
  const [selectedItem, setSelectedItem] = useState<CurationItem | null>(null);
  const [isPaidRefreshOpen, setIsPaidRefreshOpen] = useState(false);
  const [isPaymentFailureOpen, setIsPaymentFailureOpen] = useState(false);
  const [isPurchasingRefresh, setIsPurchasingRefresh] = useState(false);
  const [isDeveloperCompletingRefresh, setIsDeveloperCompletingRefresh] = useState(false);
  const [refreshPriceLabel, setRefreshPriceLabel] = useState('스토어 가격 확인 후 표시');
  const isDeveloperPaymentEnabled = isLocalDevPaymentEnabled();

  useEffect(() => {
    if (screen === 'H2') checkLikeUsed();
  }, [checkLikeUsed, screen]);

  useEffect(() => {
    if (!isPaidRefreshOpen || !user?.id) {
      return;
    }

    let mounted = true;

    getRefreshOfferingInfo(user.id)
      .then((info) => {
        if (mounted) {
          setRefreshPriceLabel(info.priceLabel);
        }
      })
      .catch((error) => {
        logger.captureException(error, {
          tags: { feature: 'paid-refresh', action: 'load-offering' },
        });
        if (mounted) {
          setRefreshPriceLabel('스토어 가격 확인 후 표시');
        }
      });

    return () => {
      mounted = false;
    };
  }, [isPaidRefreshOpen, user?.id]);

  const handleLike = async (toUserId: string) => {
    const ok = await sendLike(toUserId);
    if (ok) Alert.alert('', '좋아요를 보냈어요 ♥');
  };

  const handleRefreshPress = async () => {
    const result = await handleRefresh();
    if (result === 'exhausted') {
      setIsPaidRefreshOpen(true);
    }
  };

  const handlePurchaseRefresh = async () => {
    if (!user?.id) {
      setIsPaidRefreshOpen(false);
      setIsPaymentFailureOpen(true);
      return;
    }

    setIsPurchasingRefresh(true);

    try {
      await purchaseRefreshItem(user.id);
      const refreshResult = await handlePaidRefresh();

      if (refreshResult === 'ok') {
        setIsPaidRefreshOpen(false);
      } else {
        setIsPaidRefreshOpen(false);
        setIsPaymentFailureOpen(true);
      }
    } catch (error) {
      if (!isRevenueCatPurchaseCancelled(error)) {
        logger.captureException(error, {
          tags: { feature: 'paid-refresh', action: 'purchase' },
        });
        setIsPaymentFailureOpen(true);
      }
    } finally {
      setIsPurchasingRefresh(false);
    }
  };

  const handleDeveloperCompleteRefresh = async () => {
    setIsDeveloperCompletingRefresh(true);

    try {
      const result = await handleDeveloperPaidRefresh();

      if (result === 'ok') {
        setIsPaidRefreshOpen(false);
      } else {
        setIsPaymentFailureOpen(true);
      }
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'paid-refresh', screen: 'home' },
      });
      setIsPaymentFailureOpen(true);
    } finally {
      setIsDeveloperCompletingRefresh(false);
    }
  };

  if (screen === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F5EDDB]">
        <ActivityIndicator color="#C0432A" />
      </SafeAreaView>
    );
  }

  // H3: 빈 상태 OR H2이지만 로그 미완성 → 영상 숨김
  if (screen === 'H3' || !logProgress.isComplete) {
    return (
      <SafeAreaView className="flex-1 bg-[#F5EDDB]" edges={['left', 'right']}>
        <HomeTopBar />
        <B2Banner />
        <H3EmptyContent />
      </SafeAreaView>
    );
  }

  // H2: 로그 완성 + 큐레이션 정상
  return (
    <>
    <SafeAreaView className="flex-1 bg-black" edges={['left', 'right']}>
      <HomeTopBar />

      {/* 카드 영역 */}
      <View className="flex-1 relative">
        {/* 3카드 세로 균등 배치 */}
        {currentPool.map((item) => (
          <CurationCard
            key={item.poolId}
            item={item}
            likeUsed={likeUsed}
            onLike={handleLike}
            onPress={setSelectedItem}
          />
        ))}

        {/* 우측 도트 인디케이터 */}
        <View className="absolute right-2 top-1/2 -translate-y-5 gap-1.5 z-10">
          {pages.map((_, i) => (
            <View
              key={i}
              className={i === 0 ? 'w-1.5 h-1.5 rounded-full bg-white' : 'w-1.5 h-1.5 rounded-full bg-white/30'}
            />
          ))}
        </View>

        {/* FAB — 새로운 3명 보기 */}
        <TouchableOpacity
          className="absolute bottom-3.5 self-center bg-black/85 rounded-[20px] px-[18px] py-[7px] border border-white/15 z-10"
          onPress={handleRefreshPress}
          activeOpacity={0.85}
        >
          <Text className="text-white text-xs">새로운 3명 보기</Text>
        </TouchableOpacity>

        {/* 정오 갱신 배너 */}
        {noonBanner && (
          <View className="absolute top-12 left-4 right-4 bg-black/80 rounded-xl px-4 py-3 flex-row items-center justify-between z-20">
            <Text className="text-white text-xs flex-1">새로운 추천이 도착했어요</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={dismissNoonBanner}>
                <Text className="text-white/50 text-xs">닫기</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNoonRefresh}>
                <Text className="text-[#C0432A] text-xs font-semibold">확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>

    <VideoModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    <PaidRefreshSheet
      isDeveloperBypassEnabled={isDeveloperPaymentEnabled}
      isDeveloperCompleting={isDeveloperCompletingRefresh}
      isOpen={isPaidRefreshOpen}
      isPurchasing={isPurchasingRefresh}
      onClose={() => setIsPaidRefreshOpen(false)}
      onDeveloperComplete={handleDeveloperCompleteRefresh}
      onPurchase={handlePurchaseRefresh}
      priceLabel={refreshPriceLabel}
    />
    <PaymentFailureDialog
      isOpen={isPaymentFailureOpen}
      onClose={() => setIsPaymentFailureOpen(false)}
    />
    </>
  );
}

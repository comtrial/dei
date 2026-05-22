import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { B2Banner } from '@/components/home/B2Banner';
import { CurationCard } from '@/components/home/CurationCard';
import { H3EmptyContent } from '@/components/home/H3EmptyContent';
import { HomeTopBar } from '@/components/home/HomeTopBar';
import { PaidRefreshSheet } from '@/components/home/PaidRefreshSheet';
import { PaymentFailureDialog } from '@/components/home/PaymentFailureDialog';
import type { CurationItem } from '@/hooks/useHomeScreen';
import { Text } from '@/components/ui/text';
import { useHeartBalance } from '@/hooks/useHeartBalance';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { useLike } from '@/hooks/useLike';
import { isLocalDevPaymentEnabled } from '@/lib/dev-auth';
import { profileRoute } from '@/lib/routes';
import {
  getRefreshOfferingInfo,
  isRevenueCatPurchaseCancelled,
  purchaseRefreshItem,
} from '@/lib/refresh-purchase';
import { useAuth } from '@/providers/auth-provider';
import { logger } from '@dei/shared';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const {
    screen,
    curationItems,
    pages,
    hasAnyVideo,
    noonBanner,
    handleDeveloperPaidRefresh,
    handlePaidRefresh,
    handleNoonRefresh,
    dismissNoonBanner,
  } = useHomeScreen(user?.id);

  const { checkRemainingLikes, hasLikedUser, likeUsed, sendLike } = useLike(user?.id);
  const { heartCount, refreshHeartBalance } = useHeartBalance(user?.id);
  const [isPaidRefreshOpen, setIsPaidRefreshOpen] = useState(false);
  const [isPaymentFailureOpen, setIsPaymentFailureOpen] = useState(false);
  const [isPurchasingRefresh, setIsPurchasingRefresh] = useState(false);
  const [isUsingHeartRefresh, setIsUsingHeartRefresh] = useState(false);
  const [isDeveloperCompletingRefresh, setIsDeveloperCompletingRefresh] = useState(false);
  const [paidRefreshPurpose, setPaidRefreshPurpose] = useState<'charge-only' | 'load-more'>(
    'load-more'
  );
  const [refreshPriceLabel, setRefreshPriceLabel] = useState('스토어 가격 확인 후 표시');
  const [contentHeight, setContentHeight] = useState(0);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const loadMorePromptOpenRef = useRef(false);
  const isDeveloperPaymentEnabled = isLocalDevPaymentEnabled();
  const cardHeight = contentHeight > 0 ? Math.max(180, Math.floor(contentHeight / 3)) : undefined;

  useEffect(() => {
    if (screen === 'H2') checkRemainingLikes();
  }, [checkRemainingLikes, screen]);

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
    if (!hasAnyVideo) {
      Alert.alert('', '영상을 먼저 1개 이상 올려주세요.');
      return;
    }

    const result = await sendLike(toUserId);

    if (result === 'sent') {
      refreshHeartBalance();
      Alert.alert('', '좋아요를 보냈어요 ♥');
      return;
    }

    if (result === 'already-liked') {
      Alert.alert('', '이미 좋아요를 보냈어요.');
      return;
    }

    if (result === 'daily-limit' || result === 'heart-required') {
      Alert.alert('하트가 부족해요', '오늘의 무료 좋아요를 이미 사용했어요. 하트를 충전해 더 보낼 수 있어요.', [
        { style: 'cancel', text: '취소' },
        {
          text: '충전하기',
          onPress: () => {
            setPaidRefreshPurpose('charge-only');
            setIsPaidRefreshOpen(true);
          },
        },
      ]);
      return;
    }

    Alert.alert('', '좋아요를 보낼 수 없어요.');
  };

  const handleProfilePress = (item: CurationItem) => {
    router.push(profileRoute(item.userId) as never);
  };

  const closePaidRefresh = () => {
    loadMorePromptOpenRef.current = false;
    setIsPaidRefreshOpen(false);
  };

  const handleUseHeartRefresh = async () => {
    setIsUsingHeartRefresh(true);

    try {
      const refreshResult = await handlePaidRefresh();
      await refreshHeartBalance();

      if (refreshResult === 'exhausted') {
        Alert.alert('', '지금 더 보여드릴 새로운 추천이 부족해요. 하트는 보관돼요.');
      } else if (refreshResult === 'failed') {
        setIsPaymentFailureOpen(true);
      }
    } finally {
      setIsUsingHeartRefresh(false);
    }
  };

  const handleLoadMoreIntent = () => {
    if (
      loadMorePromptOpenRef.current ||
      isPaidRefreshOpen ||
      isPurchasingRefresh ||
      isUsingHeartRefresh
    ) {
      return;
    }

    loadMorePromptOpenRef.current = true;
    const resetPrompt = () => {
      loadMorePromptOpenRef.current = false;
    };

    if (heartCount > 0) {
      Alert.alert('하트 1개 사용', '새로운 3명을 더 볼까요?', [
        { style: 'cancel', text: '취소', onPress: resetPrompt },
        {
          text: '사용하기',
          onPress: () => {
            resetPrompt();
            handleUseHeartRefresh();
          },
        },
      ], { onDismiss: resetPrompt });
      return;
    }

    Alert.alert('하트가 부족해요', '충전하면 새로운 3명을 더 볼 수 있어요.', [
      { style: 'cancel', text: '취소', onPress: resetPrompt },
      {
        text: '충전하기',
        onPress: () => {
          resetPrompt();
          setPaidRefreshPurpose('load-more');
          setIsPaidRefreshOpen(true);
        },
      },
    ], { onDismiss: resetPrompt });
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
      await refreshHeartBalance();

      if (paidRefreshPurpose === 'charge-only') {
        setIsPaidRefreshOpen(false);
        Alert.alert('', '하트가 충전됐어요.');
        return;
      }

      const refreshResult = await handlePaidRefresh();
      await refreshHeartBalance();

      if (refreshResult === 'ok') {
        setIsPaidRefreshOpen(false);
      } else if (refreshResult === 'exhausted') {
        setIsPaidRefreshOpen(false);
        Alert.alert('', '결제는 완료됐지만 지금 더 보여드릴 새로운 추천이 부족해요. 하트는 보관돼요.');
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
      if (paidRefreshPurpose !== 'load-more') return;

      const result = await handleDeveloperPaidRefresh();
      await refreshHeartBalance();

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

  // H3: 풀 없음/부족
  if (screen === 'H3') {
    return (
      <SafeAreaView className="flex-1 bg-[#F5EDDB]" edges={['left', 'right']}>
        <HomeTopBar heartCount={heartCount} />
        {!hasAnyVideo && <B2Banner />}
        <H3EmptyContent />
      </SafeAreaView>
    );
  }

  // H2: 큐레이션 정상 (영상 업로드 여부와 무관하게 추천 노출)
  return (
    <>
    <SafeAreaView className="flex-1 bg-black" edges={['left', 'right']}>
      <HomeTopBar heartCount={heartCount} />
      {!hasAnyVideo && <B2Banner />}

      <View
        className="flex-1 relative"
        onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
      >
        <FlatList
          data={curationItems}
          keyExtractor={(item) => item.userId}
          onEndReached={() => {
            if (hasUserScrolled) handleLoadMoreIntent();
          }}
          onEndReachedThreshold={0.35}
          onScroll={(event) => {
            if (!hasUserScrolled && event.nativeEvent.contentOffset.y > 24) {
              setHasUserScrolled(true);
            }
          }}
          renderItem={({ item }) => (
            <View style={cardHeight ? { height: cardHeight } : undefined}>
              <CurationCard
                item={item}
                isLiked={hasLikedUser(item.userId)}
                isLikeUsed={!hasAnyVideo || (likeUsed && heartCount <= 0)}
                onLike={handleLike}
                onPress={handleProfilePress}
                onProfilePress={handleProfilePress}
              />
            </View>
          )}
          ListFooterComponent={
            <Pressable
              className="items-center gap-2 bg-[#0D0D0D] px-5 py-5"
              onPress={handleLoadMoreIntent}
              testID="curation-load-more-prompt"
            >
              <Text className="text-sm font-semibold text-white">결제하고 더 볼까요?</Text>
              <Text className="text-center text-xs leading-5 text-white/55">
                {heartCount > 0
                  ? `보유 하트 ${heartCount}개 · 1개를 사용해 새로운 3명을 불러와요`
                  : '하트를 충전하면 새로운 3명을 이어서 볼 수 있어요'}
              </Text>
            </Pressable>
          }
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        />

        {/* 우측 도트 인디케이터 */}
        <View className="absolute right-2 top-1/2 -translate-y-5 gap-1.5 z-10">
          {pages.map((_, i) => (
            <View
              key={i}
              className={i === 0 ? 'w-1.5 h-1.5 rounded-full bg-white' : 'w-1.5 h-1.5 rounded-full bg-white/30'}
            />
          ))}
        </View>

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

    <PaidRefreshSheet
      description={
        paidRefreshPurpose === 'load-more'
          ? '결제 성공 후 하트가 충전되고, 바로 새로운 사람 3명을 더 볼 수 있어요'
          : '결제 성공 후 하트 1개가 충전돼요. 좋아요나 더보기에 사용할 수 있어요'
      }
      isDeveloperBypassEnabled={isDeveloperPaymentEnabled && paidRefreshPurpose === 'load-more'}
      isDeveloperCompleting={isDeveloperCompletingRefresh}
      isOpen={isPaidRefreshOpen}
      isPurchasing={isPurchasingRefresh}
      onClose={closePaidRefresh}
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

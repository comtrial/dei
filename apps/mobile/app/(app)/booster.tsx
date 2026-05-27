/**
 * BoosterScreen — 부스터 구매/사용 진입 화면 (그림 A "즉시 재매칭").
 *
 * 홈의 RematchCooldownCard 또는 push `booster_offer` deeplink → 이 화면.
 * `useBoosterPurchase` + `BoosterPurchaseSheet` 조합.
 * 완료 후 홈으로 복귀 (cooldown 해제, MatchWaitingCard 또는 자유 상태).
 *
 * TODO: isFemale 은 useAuth 프로필 캐시 provider 도입 시 교체. 현재 profile fetch.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoosterPurchaseSheet } from '@/components/booster/BoosterPurchaseSheet';
import { Text } from '@/components/ui/text';
import { useBoosterPurchase } from '@/hooks/useBoosterPurchase';
import { supabase } from '@/lib/supabase';

export default function BoosterScreen() {
  const router = useRouter();
  const { step, purchaseAndConsume } = useBoosterPurchase();
  const [isFemale, setIsFemale] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from('profiles').select('gender').maybeSingle();
      if (alive) {
        setIsFemale(data?.gender === 'F');
        setProfileLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handlePurchase = useCallback(async () => {
    const result = await purchaseAndConsume();
    if (result.ok) {
      // 완료 → 잠시 후 홈 복귀
      setTimeout(() => {
        router.replace('/home' as never);
      }, 1500);
    }
  }, [purchaseAndConsume, router]);

  if (profileLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-sm text-muted-foreground">불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background justify-end">
      <View className="flex-1 bg-black/30" />
      <BoosterPurchaseSheet
        step={step}
        isFemale={isFemale}
        onPurchase={handlePurchase}
        onClose={() => router.back()}
      />
    </SafeAreaView>
  );
}

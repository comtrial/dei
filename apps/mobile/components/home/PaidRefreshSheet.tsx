import { CreditCard, RefreshCw, X } from 'lucide-react-native';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type PaidRefreshSheetProps = {
  isDeveloperBypassEnabled?: boolean;
  isDeveloperCompleting?: boolean;
  isOpen: boolean;
  isPurchasing?: boolean;
  onClose: () => void;
  onDeveloperComplete: () => void;
  onPurchase: () => void;
  priceLabel?: string;
};

export function PaidRefreshSheet({
  isDeveloperBypassEnabled = false,
  isDeveloperCompleting = false,
  isOpen,
  isPurchasing = false,
  onClose,
  onDeveloperComplete,
  onPurchase,
  priceLabel = '스토어 가격 확인 후 표시',
}: PaidRefreshSheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={isOpen}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-5 rounded-t-lg border border-[#E2D4BA] bg-[#F5EDDB] px-5 pb-8 pt-4">
          <View className="items-center">
            <View className="h-1.5 w-12 rounded-full bg-[#D8C7A8]" />
          </View>

          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-2">
              <View className="h-12 w-12 items-center justify-center rounded-md bg-[#E8D7B6]">
                <Icon as={RefreshCw} className="text-[#9A6A22]" size={24} />
              </View>
              <Text className="text-[24px] font-bold leading-8 text-[#201B16]">
                유료 리프레시
              </Text>
              <Text className="text-[16px] leading-6 text-[#776B5C]">
                리프레시 아이템을 통해 바로 새로운 사람을 만나보세요
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              className="h-10 w-10 items-center justify-center rounded-md bg-[#E8D7B6]"
              hitSlop={10}
              onPress={onClose}>
              <Icon as={X} className="text-[#201B16]" size={20} />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between rounded-md border border-[#E2D4BA] bg-[#FFF8EA] px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Icon as={CreditCard} className="text-[#9A6A22]" size={18} />
              <Text className="font-semibold text-[#201B16]">리프레시 1회</Text>
            </View>
            <Text className="font-bold text-[#201B16]">{priceLabel}</Text>
          </View>

          <View className="gap-3">
            <Button
              className="h-14 bg-[#201B16]"
              disabled={isPurchasing || isDeveloperCompleting}
              onPress={onPurchase}
              size="lg">
              {isPurchasing ? (
                <ActivityIndicator color="#FFF8EA" />
              ) : (
                <Text className="text-[17px] font-bold text-[#FFF8EA]">구매하기</Text>
              )}
            </Button>

            {isDeveloperBypassEnabled && (
              <Button
                className="h-14 border-[#D8C7A8] bg-[#FFF8EA]"
                disabled={isPurchasing || isDeveloperCompleting}
                onPress={onDeveloperComplete}
                size="lg"
                variant="outline">
                {isDeveloperCompleting ? (
                  <ActivityIndicator color="#201B16" />
                ) : (
                  <Text className="text-[16px] font-bold text-[#201B16]">
                    개발자 전용: 결제 완료 처리
                  </Text>
                )}
              </Button>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

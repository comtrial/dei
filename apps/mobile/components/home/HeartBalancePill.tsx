import { Heart, Ticket } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

type HeartBalancePillProps = {
  heartCount?: number;
};

type RefreshTicketBalancePillProps = {
  refreshItemCount?: number;
};

export function HeartBalancePill({ heartCount }: HeartBalancePillProps) {
  if (typeof heartCount !== 'number') {
    return null;
  }

  return (
    <View
      accessibilityLabel={`보유 하트 ${heartCount}개`}
      className="h-8 flex-row items-center gap-1.5 rounded-md border border-[#E0D5C0] bg-[#FFF8EA] px-2.5"
      testID="home-heart-balance"
    >
      <Heart size={15} color="#C0432A" fill="#C0432A" />
      <Text className="text-xs font-bold text-[#171310]">{heartCount}</Text>
    </View>
  );
}

export function RefreshTicketBalancePill({ refreshItemCount }: RefreshTicketBalancePillProps) {
  if (typeof refreshItemCount !== 'number') {
    return null;
  }

  return (
    <View
      accessibilityLabel={`보유 이용권 ${refreshItemCount}개`}
      className="h-8 flex-row items-center gap-1.5 rounded-md border border-[#D8CCB7] bg-[#F8F0DF] px-2.5"
      testID="home-refresh-ticket-balance"
    >
      <Ticket size={15} color="#705C2E" />
      <Text className="text-xs font-bold text-[#171310]">{refreshItemCount}</Text>
    </View>
  );
}

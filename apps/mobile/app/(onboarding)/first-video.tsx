import { Camera } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

export default function FirstVideoScreen() {
  return (
    <SafeAreaView className="bg-[#17120D] flex-1 px-7 pb-8 pt-8">
      <View className="gap-4">
        <Text className="text-[#8F6A2C] text-xs font-semibold uppercase tracking-[3px]">
          Step 4 / 4
        </Text>
        <Text className="text-[#F5EDDD] text-4xl font-semibold leading-tight">
          첫 2초를{'\n'}남겨주세요
        </Text>
        <Text className="text-[#B8AA94] text-base leading-6">
          지금은 화면만 연결합니다. 실제 촬영, 저장, 업로드 기능은 영상 담당 범위에서 붙입니다.
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="border-[#6E6354] h-56 w-56 items-center justify-center rounded-full border border-dashed">
          <Text className="text-[#6E6354] text-center text-sm font-semibold uppercase tracking-[5px]">
            Camera ·{'\n'}Viewfinder
          </Text>
        </View>
      </View>

      <View className="items-center gap-5">
        <View className="border-[#F5EDDD] h-28 w-28 items-center justify-center rounded-full border-[6px]">
          <View className="bg-[#C54B2C] h-20 w-20 rounded-full" />
        </View>
        <View className="items-center gap-2">
          <Camera color="#6E6354" size={22} />
          <Text className="text-[#6E6354] text-center text-xs font-semibold uppercase tracking-[4px]">
            Tap to record · 2s
          </Text>
          <Text className="text-[#6E6354] text-center text-xs">
            기능 없음 · 화면 확인용
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

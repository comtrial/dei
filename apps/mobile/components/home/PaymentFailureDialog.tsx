import { AlertTriangle } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type PaymentFailureDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PaymentFailureDialog({ isOpen, onClose }: PaymentFailureDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#F5EDDB]">
        <DialogHeader>
          <View className="h-12 w-12 items-center justify-center rounded-md bg-[#F0D9C9]">
            <Icon as={AlertTriangle} className="text-[#A85A4A]" size={24} />
          </View>
          <DialogTitle className="text-[24px] leading-8 text-[#201B16]">
            결제에 실패했어요
          </DialogTitle>
          <DialogDescription className="text-[16px] leading-6 text-[#776B5C]">
            잠시 후 다시 시도해주세요
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="h-14 bg-[#201B16]" onPress={onClose} size="lg">
            <Text className="text-[17px] font-bold text-[#FFF8EA]">확인</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

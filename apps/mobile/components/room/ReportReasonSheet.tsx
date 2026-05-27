/**
 * ReportReasonSheet — 신고 사유 선택 바텀시트.
 *
 * D10 기준 6개 카테고리 + 기타(자유 입력).
 * 확인 시 `onSubmit(reasonCode, reasonDetail)` 호출.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { ReportReasonCode } from '@/lib/rooms/rooms-service';

type Props = {
  visible: boolean;
  busy?: boolean;
  onSubmit: (reasonCode: ReportReasonCode, reasonDetail: string | null) => void;
  onCancel: () => void;
};

const REASONS: { code: ReportReasonCode; label: string }[] = [
  { code: 'verbal_abuse', label: '언어폭력 / 욕설' },
  { code: 'spam', label: '스팸 / 홍보' },
  { code: 'fake_profile', label: '허위 프로필' },
  { code: 'inappropriate_video', label: '부적절한 영상' },
  { code: 'harassment', label: '지속적 괴롭힘' },
  { code: 'other', label: '기타' },
];

export function ReportReasonSheet({ visible, busy, onSubmit, onCancel }: Props) {
  const [selected, setSelected] = useState<ReportReasonCode | null>(null);
  const [detail, setDetail] = useState('');

  const canSubmit = !!selected && !busy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/50" onPress={onCancel}>
        <View className="flex-1" />
        <Pressable
          className="bg-background rounded-t-3xl px-5 pt-3 pb-8"
          onPress={() => {/* do not close */}}>
          <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />
          <Text className="text-base font-semibold text-foreground mb-4">신고 사유 선택</Text>

          <ScrollView scrollEnabled={false}>
            {REASONS.map(({ code, label }) => (
              <Pressable
                key={code}
                testID={`room-report-reason-${code}`}
                onPress={() => setSelected(code)}
                className={[
                  'flex-row items-center py-3 border-b border-border/40',
                  selected === code ? 'opacity-100' : 'opacity-80',
                ].join(' ')}>
                <View
                  className={[
                    'w-5 h-5 rounded-full border-2 mr-3',
                    selected === code ? 'border-primary bg-primary' : 'border-border',
                  ].join(' ')}
                />
                <Text className="text-sm text-foreground">{label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {selected === 'other' && (
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="자세한 내용을 입력해주세요 (선택)"
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={200}
              className="mt-3 bg-muted rounded-xl px-4 py-3 text-sm text-foreground min-h-[80px]"
            />
          )}

          <Button
            testID="room-report-submit-button"
            onPress={() => {
              if (selected) onSubmit(selected, detail.trim() || null);
            }}
            disabled={!canSubmit}
            className="mt-4">
            <Text>{busy ? '신고 중…' : '신고하기'}</Text>
          </Button>

          <Button variant="ghost" onPress={onCancel} disabled={busy} className="mt-2">
            <Text>취소</Text>
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

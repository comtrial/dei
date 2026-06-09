import { useMemo } from 'react';
import { View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { BottomSheet, Text, color } from '@dei/ui';

LocaleConfig.locales['ko'] = {
  monthNames: [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월',
  ],
  monthNamesShort: [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월',
  ],
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

function dateToKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type DayMarking = {
  selected?: boolean;
  selectedColor?: string;
  marked?: boolean;
  dotColor?: string;
};

export interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  /** 영상이 1개라도 있는 KST 날짜 키('YYYY-MM-DD') 집합 — 점으로 표기 */
  markedDateKeys?: Set<string>;
}

export function CalendarSheet({
  visible,
  onClose,
  selectedDate,
  onSelect,
  minDate,
  markedDateKeys,
}: CalendarSheetProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = dateToKey(today);
  const selectedKey = dateToKey(selectedDate);
  const minKey = minDate ? dateToKey(minDate) : undefined;

  const markedDates = useMemo(() => {
    const marks: Record<string, DayMarking> = {};
    if (markedDateKeys) {
      for (const key of markedDateKeys) {
        marks[key] = { marked: true, dotColor: color.accent };
      }
    }
    // 선택일 강조 — 영상 있는 날과 겹치면 점+강조 둘 다 유지
    marks[selectedKey] = {
      ...marks[selectedKey],
      selected: true,
      selectedColor: color.accent,
    };
    return marks;
  }, [markedDateKeys, selectedKey]);

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={56}>
      <View className="px-4 pt-2">
        <Text variant="h2" className="mb-3 text-center">
          날짜 선택
        </Text>
        <Calendar
          testID="calendar-sheet"
          current={selectedKey}
          maxDate={todayKey}
          minDate={minKey}
          onDayPress={(day) => {
            const picked = new Date(day.year, day.month - 1, day.day);
            onSelect(picked);
          }}
          markedDates={markedDates}
          theme={{
            backgroundColor: color.paper,
            calendarBackground: color.paper,
            textSectionTitleColor: color['ink-3'],
            selectedDayBackgroundColor: color.accent,
            selectedDayTextColor: color.paper,
            todayTextColor: color.accent,
            dayTextColor: color.ink,
            textDisabledColor: color['ink-4'],
            arrowColor: color.accent,
            monthTextColor: color.ink,
            textDayFontWeight: '600',
            textMonthFontWeight: '700',
            textDayHeaderFontWeight: '600',
          }}
        />
      </View>
    </BottomSheet>
  );
}

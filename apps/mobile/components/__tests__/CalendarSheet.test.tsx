import { render } from '@testing-library/react-native';

import { CalendarSheet } from '../calendar-sheet';

// Calendar 의 markedDates prop 만 캡처 — 실제 달력 렌더는 테스트 대상 아님.
let lastMarkedDates: Record<string, unknown> | undefined;
jest.mock('react-native-calendars', () => ({
  Calendar: (props: { markedDates?: Record<string, unknown> }) => {
    lastMarkedDates = props.markedDates;
    return null;
  },
  LocaleConfig: { locales: {}, defaultLocale: 'ko' },
}));

// BottomSheet(Modal 기반) 우회 — children 만 그대로 렌더.
jest.mock('@dei/ui', () => {
  const actual = jest.requireActual('@dei/ui');
  return {
    ...actual,
    BottomSheet: ({ children }: { children: React.ReactNode }) => children,
  };
});

const selectedDate = new Date(2026, 5, 9); // 2026-06-09 (local)

describe('CalendarSheet markedDateKeys', () => {
  beforeEach(() => {
    lastMarkedDates = undefined;
  });

  it('영상 있는 날짜 키마다 점(marked) 을 찍는다', () => {
    render(
      <CalendarSheet
        visible
        onClose={() => {}}
        selectedDate={selectedDate}
        onSelect={() => {}}
        markedDateKeys={new Set(['2026-06-07', '2026-06-08'])}
      />,
    );

    expect(lastMarkedDates?.['2026-06-07']).toMatchObject({ marked: true });
    expect(lastMarkedDates?.['2026-06-08']).toMatchObject({ marked: true });
  });

  it('선택일은 selected 로 강조한다', () => {
    render(
      <CalendarSheet
        visible
        onClose={() => {}}
        selectedDate={selectedDate}
        onSelect={() => {}}
        markedDateKeys={new Set()}
      />,
    );

    expect(lastMarkedDates?.['2026-06-09']).toMatchObject({ selected: true });
  });

  it('선택일과 영상 있는 날이 겹치면 점+강조 둘 다 유지한다', () => {
    render(
      <CalendarSheet
        visible
        onClose={() => {}}
        selectedDate={selectedDate}
        onSelect={() => {}}
        markedDateKeys={new Set(['2026-06-09'])}
      />,
    );

    expect(lastMarkedDates?.['2026-06-09']).toMatchObject({
      marked: true,
      selected: true,
    });
  });

  it('markedDateKeys 미전달 시 선택일만 강조한다(하위호환)', () => {
    render(
      <CalendarSheet
        visible
        onClose={() => {}}
        selectedDate={selectedDate}
        onSelect={() => {}}
      />,
    );

    expect(lastMarkedDates?.['2026-06-09']).toMatchObject({ selected: true });
    expect(Object.keys(lastMarkedDates ?? {})).toEqual(['2026-06-09']);
  });
});

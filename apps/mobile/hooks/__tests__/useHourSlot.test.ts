jest.mock('@dei/shared', () => {
  const actual = jest.requireActual<typeof import('@dei/shared')>('@dei/shared');
  return {
    ...actual,
    getCurrentHourSlotKst: jest.fn(() => 14),
  };
});

import { renderHook, act } from '@testing-library/react-native';
import { getCurrentHourSlotKst } from '@dei/shared';
import { useHourSlot } from '../useHourSlot';

const mockGetCurrentHourSlotKst = getCurrentHourSlotKst as jest.MockedFunction<typeof getCurrentHourSlotKst>;

describe('useHourSlot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetCurrentHourSlotKst.mockReturnValue(14);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('초기값 = getCurrentHourSlotKst() 반환값', () => {
    const { result } = renderHook(() => useHourSlot());
    expect(result.current.currentHour).toBe(14);
  });

  it('setCurrentHour 로 수동 변경 가능', () => {
    const { result } = renderHook(() => useHourSlot());
    act(() => {
      result.current.setCurrentHour(18);
    });
    expect(result.current.currentHour).toBe(18);
  });

  it('60초 interval 후 KST 시 변경 시 자동 갱신', () => {
    mockGetCurrentHourSlotKst.mockReturnValue(14);

    const { result } = renderHook(() => useHourSlot());
    expect(result.current.currentHour).toBe(14);

    mockGetCurrentHourSlotKst.mockReturnValue(15);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.currentHour).toBe(15);
  });
});

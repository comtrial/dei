import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-native';

import { useHourSlot } from '../useHourSlot';

vi.mock('@dei/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dei/shared')>();
  return {
    ...actual,
    getCurrentHourSlotKst: vi.fn(() => 14),
  };
});

describe('useHourSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('60초 interval 후 KST 시 변경 시 자동 갱신', async () => {
    const { getCurrentHourSlotKst } = await import('@dei/shared');
    const mockFn = getCurrentHourSlotKst as ReturnType<typeof vi.fn>;
    mockFn.mockReturnValue(14);

    const { result } = renderHook(() => useHourSlot());
    expect(result.current.currentHour).toBe(14);

    mockFn.mockReturnValue(15);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.currentHour).toBe(15);
  });
});

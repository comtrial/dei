import { renderHook, waitFor } from '@testing-library/react-native';

const mockGetRoomVideoHours = jest.fn();

jest.mock('@/lib/room-rpc', () => ({
  getRoomVideoHours: (...args: unknown[]) => mockGetRoomVideoHours(...args),
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import { useRoomVideoHours } from '../useRoomVideoHours';

describe('useRoomVideoHours', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRoomVideoHours.mockResolvedValue(new Set([9, 17]));
  });

  it('loads hour slots with videos for the selected date', async () => {
    const selectedDate = new Date(2026, 5, 10);
    const { result } = renderHook(() => useRoomVideoHours('room-1', selectedDate));

    await waitFor(() => {
      expect(result.current.has(9)).toBe(true);
      expect(result.current.has(17)).toBe(true);
    });

    expect(mockGetRoomVideoHours).toHaveBeenCalledWith(
      'room-1',
      selectedDate.getTime(),
      selectedDate.getTime() + 24 * 60 * 60 * 1000,
    );
  });
});

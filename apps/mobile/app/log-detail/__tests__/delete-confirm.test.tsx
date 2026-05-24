import { analytics } from '@dei/shared';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import DeleteConfirmRoute from '@/app/log-detail/delete-confirm';

const mockDeleteLog = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), dismiss: jest.fn() }),
  useLocalSearchParams: () => ({
    logId: 'log-1',
    userId: 'user-1',
    date: '2026-05-24',
    willBecomeIncomplete: '1',
  }),
}));

jest.mock('@/hooks/useLogDetail', () => ({
  useLogDetail: () => ({
    logs: [{ id: 'log-1', video_url: 'logs/log-1.mp4', recorded_at: '2026-05-24T09:00:00.000Z' }],
  }),
}));

jest.mock('@/hooks/useDeleteLog', () => ({
  useDeleteLog: () => ({ deleteLog: mockDeleteLog, pending: false }),
}));

// Toast/Dialog 의 RN 애니메이션 의존성 제거 + onConfirm 트리거 버튼만 노출.
jest.mock('@/components/ui/toast', () => ({
  Toast: () => null,
}));

jest.mock('@/components/log-detail/DeleteConfirmDialog', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DeleteConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => (
      <Pressable testID="confirm-delete" onPress={onConfirm}>
        <Text>delete</Text>
      </Pressable>
    ),
  };
});

const captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);

describe('DeleteConfirmRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures daily_log_incomplete with previous_log_count when a delete makes the day incomplete', async () => {
    mockDeleteLog.mockResolvedValue({
      kind: 'ok-remaining',
      remainingStatus: 'INCOMPLETE',
      remainingCount: 2,
    });

    const { getByTestId } = render(<DeleteConfirmRoute />);

    fireEvent.press(getByTestId('confirm-delete'));

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('daily_log_incomplete', {
        previous_log_count: 3,
      });
    });
  });
});

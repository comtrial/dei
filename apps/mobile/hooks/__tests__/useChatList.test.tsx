/**
 * useChatList 동작 테스트 (PM 검증서 P1-5 / P2-8).
 *   - 정상 로드 → items, error=false
 *   - 로드 실패 → error=true (호출부가 CH3 빈 상태 아닌 에러 상태로 분기)
 *   - reload → 재조회
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useChatList } from '../useChatList';

const mockFetch = jest.fn();

jest.mock('@/lib/chat/chat-service', () => ({
  fetchChatList: (...a: unknown[]) => mockFetch(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useChatList', () => {
  it('정상 로드 → items 채워지고 error=false', async () => {
    mockFetch.mockResolvedValue([
      {
        conversationId: 'c1',
        otherUserId: 'u2',
        otherNickname: '하늘',
        lastMessagePreview: '안녕',
        updatedAt: '2026-05-16T09:00:00Z',
        status: 'ACTIVE',
      },
    ]);

    const { result } = renderHook(() => useChatList('me'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBe(false);
  });

  it('로드 실패 → error=true, items 빈 채로 (CH3 오표시 방지 — P1-5)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useChatList('me'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.items).toHaveLength(0);
  });

  it('reload → fetchChatList 재호출', async () => {
    mockFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useChatList('me'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    act(() => result.current.reload());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('myUserId 없으면 조회 안 함', async () => {
    const { result } = renderHook(() => useChatList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

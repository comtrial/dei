import { act, render, waitFor } from '@testing-library/react-native';
import * as mockReact from 'react';

type MemberUpdateHandler = (row: Record<string, unknown>) => void;

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockAddSystemMessage = jest.fn();
const mockGetRoomMembersWithProfile = jest.fn();
const mockResolveProfilePhotoUrls = jest.fn();
const mockSetCachedRoomChatMembers = jest.fn();
const mockGetCachedRoomChatMembers = jest.fn();
let mockMemberUpdateHandler: MemberUpdateHandler | null = null;
let mockLatestChatProps: {
  isInitialLoading?: boolean;
  memberCount?: number;
  members?: { name: string; status: string; userId: string }[];
  onSelfProfilePress?: () => void;
} | null = null;
let mockChatMessages: Record<string, unknown>[] = [];
let mockChatInitialLoading = false;
let mockProfileRows: Record<string, unknown>[] = [];

jest.mock('expo-router', () => {
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockReact.useEffect(() => effect(), [effect]);
    },
    useLocalSearchParams: () => ({ roomId: 'room-1' }),
    useRouter: () => ({ back: mockBack, push: mockPush }),
  };
});

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
  },
}));

jest.mock('@dei/ui', () => ({
  avatarColorFor: (userId: string) => `bg-${userId}`,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

jest.mock('@/hooks/useRoomChat', () => ({
  useRoomChat: () => ({
    addSystemMessage: (...args: unknown[]) => mockAddSystemMessage(...args),
    isInitialLoading: mockChatInitialLoading,
    messages: mockChatMessages,
    retry: jest.fn(),
    send: jest.fn(),
  }),
}));

jest.mock('@/components/chat/RoomChatView', () => ({
  RoomChatView: (props: {
    memberCount?: number;
    members?: { name: string; status: string; userId: string }[];
  }) => {
    mockLatestChatProps = props;
    return null;
  },
}));

jest.mock('@/lib/realtime', () => ({
  subscribeRoomMembers: jest.fn((_roomId: string, onUpdate: MemberUpdateHandler) => {
    mockMemberUpdateHandler = onUpdate;
    return jest.fn();
  }),
  subscribeRoomStatus: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/room-rpc', () => ({
  getRoomMembersWithProfile: (...args: unknown[]) => mockGetRoomMembersWithProfile(...args),
}));

jest.mock('@/lib/profile-photo-cache', () => ({
  resolveProfilePhotoUrls: (...args: unknown[]) => mockResolveProfilePhotoUrls(...args),
}));

jest.mock('@/lib/chat/member-cache', () => ({
  getCachedRoomChatMembers: (...args: unknown[]) => mockGetCachedRoomChatMembers(...args),
  setCachedRoomChatMembers: (...args: unknown[]) => mockSetCachedRoomChatMembers(...args),
}));

jest.mock('@/lib/chat/presentation', () => ({
  useChatPresentationMode: () => 'legacy',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } }, error: null }),
    },
    from: jest.fn((table: string) => {
      if (table === 'profile') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: mockProfileRows, error: null }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { ended_at: null, id: 'room-1', status: 'active' },
          error: null,
        }),
      };
    }),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered before SUT import
import RoomChatScreen from '../chat';

describe('RoomChatScreen member leave realtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMemberUpdateHandler = null;
    mockLatestChatProps = null;
    mockChatMessages = [];
    mockChatInitialLoading = false;
    mockProfileRows = [];
    mockGetCachedRoomChatMembers.mockReturnValue([]);
    mockResolveProfilePhotoUrls.mockResolvedValue(new Map());
    mockGetRoomMembersWithProfile.mockResolvedValue([
      {
        room_id: 'room-1',
        user_id: 'me',
        role: 'member',
        status: 'active',
        joined_at: '2026-06-07T00:00:00.000Z',
        left_at: null,
        profile: { nickname: '나', photo_url: null },
      },
      {
        room_id: 'room-1',
        user_id: 'user-a',
        role: 'member',
        status: 'active',
        joined_at: '2026-06-07T00:00:00.000Z',
        left_at: null,
        profile: { nickname: '수아', photo_url: null },
      },
    ]);
  });

  it('adds a chat system notice and removes the leaver from active member count', async () => {
    render(<RoomChatScreen />);

    await waitFor(() => {
      expect(mockLatestChatProps?.memberCount).toBe(2);
    });

    await waitFor(() => {
      expect(mockMemberUpdateHandler).toEqual(expect.any(Function));
    });

    act(() => {
      mockMemberUpdateHandler?.({
        left_at: '2026-06-07T00:01:00.000Z',
        room_id: 'room-1',
        status: 'left',
        user_id: 'user-a',
      });
    });

    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '수아님이 나갔어요',
        id: 'member-left-room-1-user-a-2026-06-07T00:01:00.000Z',
        userId: 'user-a',
      }),
    );

    await waitFor(() => {
      expect(mockLatestChatProps?.memberCount).toBe(1);
    });
  });

  it('opens my profile from the chat header avatar', async () => {
    render(<RoomChatScreen />);

    await waitFor(() => {
      expect(mockLatestChatProps?.onSelfProfilePress).toEqual(expect.any(Function));
    });

    act(() => {
      mockLatestChatProps?.onSelfProfilePress?.();
    });

    expect(mockPush).toHaveBeenCalledWith('/(app)/my-profile');
  });

  it('passes initial chat loading state to suppress premature empty state', async () => {
    mockChatInitialLoading = true;

    render(<RoomChatScreen />);

    await waitFor(() => {
      expect(mockLatestChatProps?.isInitialLoading).toBe(true);
    });
  });

  it('hydrates a non-active historical message author so past bubbles keep a name', async () => {
    mockChatMessages = [
      {
        id: 'msg-1',
        clientMsgId: null,
        userId: 'user-left',
        body: '예전 메시지',
        whisperToUserId: null,
        createdAt: '2026-06-07T00:00:00.000Z',
        sendState: 'sent',
        kind: 'user',
      },
    ];
    mockProfileRows = [
      {
        bio: null,
        birth_year: null,
        gender: null,
        mbti: null,
        nickname: '서연',
        photo_url: null,
        region: null,
        user_id: 'user-left',
      },
    ];
    mockGetRoomMembersWithProfile.mockResolvedValue([
      {
        room_id: 'room-1',
        user_id: 'me',
        role: 'member',
        status: 'active',
        joined_at: '2026-06-07T00:00:00.000Z',
        left_at: null,
        profile: { nickname: '나', photo_url: null },
      },
    ]);

    render(<RoomChatScreen />);

    await waitFor(() => {
      expect(mockLatestChatProps?.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: '서연',
            status: 'left',
            userId: 'user-left',
          }),
        ]),
      );
    });
  });
});

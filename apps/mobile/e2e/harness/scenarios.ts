/**
 * Deterministic fixture props for the S13a RoomChatView Playwright harness.
 *
 * Each scenario is a plain prop bundle for the *real* RoomChatView. No Supabase
 * — the view is pure, so the browser exercises production rendering/interaction
 * with these fixtures. Keep ids/text stable; specs assert on them.
 */
import type { ChatMessage } from '@/lib/chat/message-merge';
import type { RoomMemberLite } from '@/lib/chat/mention';

const SELF = 'me';

const MEMBERS: RoomMemberLite[] = [
  { userId: 'u1', name: '수아', status: 'active', avatarInitial: '수', avatarBg: 'bg-[#7A8DB8]' },
  { userId: 'u2', name: '민준', status: 'active', avatarInitial: '민', avatarBg: 'bg-[#7A6CB8]' },
  { userId: 'u3', name: '지훈', status: 'active', avatarInitial: '지', avatarBg: 'bg-[#A86B8A]' },
  { userId: 'me', name: '나', status: 'active', avatarInitial: '나', avatarBg: 'bg-[#C99A5B]' },
];

const BASE_MSGS: ChatMessage[] = [
  { id: 's1', clientMsgId: null, userId: 'u1', body: '안녕하세요! 다들 어디서 일해요?', whisperToUserId: null, createdAt: 't1', sendState: 'sent' },
  { id: 's2', clientMsgId: null, userId: 'u2', body: '합정 쪽이에요', whisperToUserId: null, createdAt: 't2', sendState: 'sent' },
  { id: 's3', clientMsgId: null, userId: 'me', body: '저도 합정! 카페 자주 가요', whisperToUserId: null, createdAt: 't3', sendState: 'sent' },
];

export interface ScenarioFixture {
  selfId: string;
  members: RoomMemberLite[];
  messages: ChatMessage[];
  input?: string;
  whisperTarget?: { userId: string; name: string; avatarInitial?: string; avatarBg?: string } | null;
  newCount?: number;
  blockedIds?: Set<string>;
  roomEnded?: boolean;
  overlay?: boolean;
}

export const SCENARIOS = {
  // 기본 전체화면: them/me 버블, 헤더 멤버수+아바타 스택, 컴포저.
  'room-basic': {
    selfId: SELF,
    members: MEMBERS,
    messages: BASE_MSGS,
  },

  // 오버레이 모드: 영상 위 dim scrim + dark band(헤더/컴포저) + 본문 transparent.
  'overlay': {
    selfId: SELF,
    members: MEMBERS,
    messages: [
      ...BASE_MSGS,
      { id: 'w3', clientMsgId: null, userId: 'u2', body: '우리 둘이 따로 보자', whisperToUserId: 'me', createdAt: 't4', sendState: 'sent' },
    ],
    overlay: true,
  },

  // 받은 귓속말: 보낸이(민준) 아바타 + 이름 + '귓속말' 태그, 방향 안내 없음.
  'whisper-received': {
    selfId: SELF,
    members: MEMBERS,
    messages: [
      ...BASE_MSGS,
      { id: 'w1', clientMsgId: null, userId: 'u2', body: '우리 둘이 따로 보자', whisperToUserId: 'me', createdAt: 't4', sendState: 'sent' },
    ],
  },

  // 내가 보낸 귓속말: 내 아바타(우측) + '귓속말' 태그(이름 숨김).
  'whisper-sent': {
    selfId: SELF,
    members: MEMBERS,
    messages: [
      ...BASE_MSGS,
      { id: 'w2', clientMsgId: null, userId: 'me', body: '카페 추천해줘요', whisperToUserId: 'u1', createdAt: 't5', sendState: 'sent' },
    ],
  },

  // @ 입력 활성 → 멘션 자동완성 패널.
  'mention-active': {
    selfId: SELF,
    members: MEMBERS,
    messages: BASE_MSGS,
    input: '@수',
  },

  // 귓속말 칩 활성(컴포저 헤더에 대상 칩).
  'whisper-composing': {
    selfId: SELF,
    members: MEMBERS,
    messages: BASE_MSGS,
    whisperTarget: { userId: 'u1', name: '수아', avatarInitial: '수', avatarBg: 'bg-[#7A8DB8]' },
  },

  // 새 메시지 점프 pill.
  'new-messages': {
    selfId: SELF,
    members: MEMBERS,
    messages: BASE_MSGS,
    newCount: 3,
  },

  // 빈 상태: 메시지 0건 → 안내 + 컴포저 유지.
  empty: {
    selfId: SELF,
    members: MEMBERS,
    messages: [],
  },

  // 방 종료(읽기전용): 스트림 보존 + 컴포저 비활성.
  'room-ended': {
    selfId: SELF,
    members: MEMBERS,
    messages: BASE_MSGS,
    roomEnded: true,
    input: '보낼 수 없음',
  },
} satisfies Record<string, ScenarioFixture>;

export type ScenarioName = keyof typeof SCENARIOS;

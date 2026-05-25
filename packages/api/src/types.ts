import type { Database } from './database.types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TableInserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TableUpdates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

export type Profile = Tables<'profiles'>;
export type PrivateProfile = Tables<'private_profiles'>;
export type AccountStatus = Tables<'account_status'>;
export type IdentityVerification = Tables<'identity_verifications'>;
export type UserConsent = Tables<'user_consents'>;
export type UserDevice = Tables<'user_devices'>;
export type ProfileVideo = Tables<'profile_videos'>;
export type Block = Tables<'blocks'>;
export type Report = Tables<'reports'>;
export type ModerationCase = Tables<'moderation_cases'>;
export type AdminAction = Tables<'admin_actions'>;

export type AccountState = Enums<'account_state'>;
export type OnboardingState = Enums<'onboarding_state'>;
export type VerificationStatus = Enums<'verification_status'>;
export type ModerationStatus = Enums<'moderation_status'>;

// 새 도메인 reports schema (`reason_code` + `status` 컬럼).
// 옛 admin-console 한글 컬럼(`reason`, `처리상태`) 은 Phase 2 에서 폐기됨.
export type ReportReason = Report['reason_code'];
export type ReportStatus = Report['status'];

// 새 도메인 핵심 테이블 type alias — Phase 3 hooks/lib 가 사용.
export type RoomRow = Tables<'rooms'>;
export type RoomMember = Tables<'room_members'>;
export type GroupRow = Tables<'groups'>;
export type GroupMember = Tables<'group_members'>;
export type MatchQueueRow = Tables<'match_queue'>;
export type HourlyUpload = Tables<'hourly_uploads'>;
export type ChatMessage = Tables<'chat_messages'>;
export type ChatMention = Tables<'chat_mentions'>;
export type RoomAutoKick = Tables<'room_auto_kicks'>;
export type RoomLeaveCooldown = Tables<'room_leave_cooldowns'>;
export type BoosterGrant = Tables<'booster_grants'>;

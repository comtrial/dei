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
export type ReportReason = Enums<'report_reason'>;
export type ReportStatus = Enums<'report_status'>;

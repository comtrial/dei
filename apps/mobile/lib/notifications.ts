/**
 * 알림 타입 정의.
 *
 * Phase 1 정리: 옛 도메인 타입(curation_ready / like_received / match_created
 * / dm_received) 제거. 새 도메인(방/묶음/부스터) 알림 타입은 Phase 2 마이그레이션
 * 시 추가 — 매핑은 docs/rooms-spec/db-design.md 의 notification_type enum 참고.
 *
 * 현재 살아있는 타입은 영상/결제/시스템 도메인 무관 인프라성 알림만.
 * 새 enum 값은 서버(supabase notification_type) 가 push 발송 시 임의 string 으로
 * 줄 수도 있으므로 `string` 도 유니온 — 안전한 표시용 fallback 보장.
 */
export type NotificationType =
  | 'log_reminder'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_refunded'
  | 'profile_viewed'
  | 'daily_log'
  | 'report_status'
  | 'block_status'
  | 'system';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  dedupe_key?: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type RegisterPushTokenInput = {
  appVersion?: string | null;
  deviceLabel?: string | null;
  installationIdHash: string;
  platform: 'ios' | 'android' | 'web';
  pushProvider?: 'expo' | 'apns' | 'fcm';
  pushToken: string;
};

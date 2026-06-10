/**
 * PostHog 이벤트 택소노미 (spec §3.3 · A-4)
 * ------------------------------------------------------------------
 * `screens-extracted.json` 의 화면별 `events[]` 를 단일 상수로 고정한다.
 * 화면 코드는 raw 문자열로 capture 하지 말고 반드시 여기 상수를 참조한다 —
 * 이벤트명 오타·표류를 컴파일 타임에 막고, 분석 대시보드 스키마를 한 곳에서
 * 관리하기 위함이다.
 *
 * 발송은 `@dei/shared` 의 `analytics` transport(=PostHog, lib/posthog.ts 에서
 * 등록)를 통한다. 새 이벤트가 생기면 먼저 여기 추가 → 화면에서 import.
 *
 * prefix 의미(원천 flowmap):
 *   S02/S03/S11/S12/S19~S23 = 해당 화면 단독 이벤트
 *   S2 = 프로필 멀티스텝(F24) · S3 = 매칭/홈 happy-path · S4/S5 = 방·블러게이트
 *   S7 = 방 오버플로 메뉴 · L2 = 정책 평가(재매칭 제한)
 */
export const ANALYTICS_EVENTS = {
  // 가입·본인인증
  terms_agreement_screen_entered: 'S02:terms_agreement_screen_entered',
  phone_auth_cancelled_by_user: 'S03:phone_auth_cancelled_by_user',

  // 프로필 멀티스텝 (F24)
  profile_step_completed: 'S2:profile_step_completed',
  profile_photo_uploaded: 'S2:profile_photo_uploaded',

  // 홈·매칭 (happy-path)
  home_entered_waiting: 'S3:home_entered_waiting',
  join_team_selected: 'S3:join_team_selected',
  team_queue_registered: 'S3:team_queue_registered',
  match_cancel_confirm_shown: 'S3:match_cancel_confirm_shown',
  match_cancelled_by_user: 'S3:match_cancelled_by_user',
  rematch_restriction_evaluated: 'L2:rematch_restriction_evaluated',
  payment_failure_alert_shown: 'S18:payment_failure_alert_shown',

  // 방·블러게이트
  room_preview_entered_blurred: 'S4:room_preview_entered_blurred',
  room_entered_blurred: 'S4:room_entered_blurred',
  room_joined_unblurred: 'S5:room_joined_unblurred',
  blur_reapplied_24h_passed: 'S5:blur_reapplied_24h_passed',
  room_chat_opened: 'S5:room_chat_opened',
  whisper_mention_sent: 'S5:whisper_mention_sent',
  room_closed_last_member_left: 'S5:room_closed_last_member_left',
  leave_room_menu_opened: 'S5:leave_room_menu_opened',
  leave_cancelled: 'S5:leave_cancelled',
  room_overflow_menu_opened: 'S7:profile_overflow_menu_opened',

  // grid 성능 모니터링 (C-2 §6)
  room_grid_first_render: 'S5:room_grid_first_render',
  room_grid_realtime_lag: 'S5:room_grid_realtime_lag',
  room_timestrip_swipe: 'S5:room_timestrip_swipe',

  // 영상 촬영
  video_capture_entered: 'S11:video_capture_entered',
  capture_failure_alert_shown: 'S12:capture_failure_alert_shown',

  // 영상 서빙 (C-1 §5 — PostHog 모니터링)
  video_load_started: 'S13:video_load_started',
  video_first_frame_rendered: 'S13:video_first_frame_rendered',
  video_stalled: 'S13:video_stalled',
  video_error: 'S13:video_error',

  // 프로필 허브·설정·신고·고객센터
  profile_hub_opened: 'S19:profile_hub_opened',
  nickname_change_throttled_30d: 'S19:nickname_change_throttled_30d',
  withdraw_screen_entered: 'S20:withdraw_screen_entered',
  withdraw_confirmed: 'S20:withdraw_confirmed',
  report_category_entered: 'S21:report_category_entered',
  report_submitted: 'S21:report_submitted',
  notification_settings_opened: 'S22:notification_settings_opened',
  notification_master_toggled: 'S22:notification_master_toggled',
  support_form_opened: 'S23:support_form_opened',
  inquiry_submitted: 'S23:inquiry_submitted',

  // ── 퍼널 spine (F##:) — rooms/queue 4대 퍼널 (2026-06-07 design) ──
  // A Activation
  app_opened: 'F0:app_opened',
  phone_verification_succeeded: 'F0:phone_verification_succeeded',
  onboarding_completed: 'F0:onboarding_completed',
  // B Match
  room_matched: 'F1:room_matched',
  // C Engagement
  video_uploaded: 'F2:video_uploaded',
  // D Monetization(결제 신호)
  booster_paywall_shown: 'F3:booster_paywall_shown',
  booster_purchase_attempted: 'F3:booster_purchase_attempted',
  booster_purchase_succeeded: 'F3:booster_purchase_succeeded',
} as const;

export type AnalyticsEventKey = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[AnalyticsEventKey];

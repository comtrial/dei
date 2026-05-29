-- Phase 4 (1/2) — 기존 원격 도메인 객체 일괄 제거 (zero-base 덮어쓰기).
--
-- 원격 ref sjlzidjnpczysygnlmtk 에는 dei-ver2 rooms 도메인 + 옛 큐레이션/채팅/
-- 좋아요 잔재가 섞여 있다. A 골격(team/group_match/room_member 네이밍)으로
-- 새로 덮어쓰기 위해 public 스키마의 도메인 객체를 전부 drop 한다.
--
-- 주의:
--   - auth.* (Supabase 관리) 는 건드리지 않는다.
--   - storage.* 버킷/오브젝트는 별도(영상 후속 담당) — 여기서 손대지 않는다.
--   - profiles 도 drop 한다 (A 골격에서 재정의). auth.users 트리거가 있으면
--     함께 정리.

-- ── 트리거/함수 정리 (profiles 자동생성 트리거 등) ──────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- ── 도메인 테이블 일괄 drop (확인된 원격 36개 기준, FK 무시 위해 cascade) ───
drop table if exists
  public.payments,
  public.groups,
  public.room_auto_kicks,
  public.chat_messages,
  public.user_consents,
  public.private_profiles,
  public.blocks,
  public.feature_flags,
  public.sms_log,
  public.audit_log,
  public.chat_mentions,
  public.reports,
  public.refresh_item_grants,
  public.user_devices,
  public.admins,
  public.admin_actions,
  public.review_history,
  public.booster_grants,
  public.identity_verifications,
  public.account_status,
  public.profile_videos,
  public.room_members,
  public.hourly_uploads,
  public.moderation_cases,
  public.refresh_redemptions,
  public.feature_flag_rules,
  public.daily_logs,
  public.logs,
  public.revenuecat_webhook_events,
  public.match_queue,
  public.group_members,
  public.room_leave_cooldowns,
  public.notifications,
  public.rooms,
  public.profiles
  cascade;

-- ── 남은 도메인 뷰/머티리얼라이즈드뷰 ──────────────────────────────────────
drop view if exists public.v_block_pairs cascade;

-- ── 도메인 RPC/헬퍼 함수 (혹시 남아있을 수 있는 것들) ───────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_group','disband_group','enqueue_group_for_match','admin_create_room',
        'upload_hourly_video','send_chat_message','block_user','report_user','leave_room',
        'consume_booster_grant','grant_free_booster_for_female',
        'accept_like','reject_like','send_like','expire_overdue_likes',
        'ensure_conversation_for_match','set_updated_at','is_admin',
        'chat_is_blocked_between'
      )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

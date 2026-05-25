-- Drop legacy curation / 1:1 chat / likes / matches domain objects.
--
-- 이전 KEEP 마이그레이션(`align_with_dei_schema_core`, `auto_approve_profile_videos`,
-- `notification_foundation_and_heart_like` 등) 안에 옛 도메인 객체 정의가 섞여
-- 있어 단순히 옛 마이그레이션을 archive 한 것만으로는 객체가 제거되지 않는다.
-- 이 마이그레이션은 새 도메인 베이스라인(`rooms_v1_baseline`)보다 먼저 실행되어
-- 옛 도메인 객체를 일괄 CASCADE DROP 한다.
--
-- 이 파일은 새 베이스라인과 함께 도입된다. 한 번 적용된 후 다시 적용해도
-- (`IF EXISTS`) 무해하다. Phase 2A — feat/rooms-pivot.

-- ============================================================================
-- 1) 트리거 (의존성이 가장 얕음 → 가장 먼저)
-- ============================================================================
drop trigger if exists logs_sync_curation_pool on public.logs;
drop trigger if exists likes_notify_received on public.likes;

-- ============================================================================
-- 2) 함수 / RPC
-- ============================================================================
drop function if exists public.insert_approved_log_to_curation_pool() cascade;
drop function if exists public.send_like(uuid, text) cascade;
drop function if exists public.send_like(uuid) cascade;
drop function if exists public.accept_like(uuid) cascade;
drop function if exists public.reject_like(uuid) cascade;
drop function if exists public.expire_overdue_likes() cascade;
drop function if exists public.exclude_blocked_users_from_curation(uuid) cascade;
drop function if exists public.exclude_blocked_users_from_curation() cascade;
drop function if exists public.curation_opposite_gender_filter(uuid) cascade;
drop function if exists public.recalc_daily_log_for_date(date) cascade;
drop function if exists public.expire_overdue_likes_batch() cascade;
drop function if exists public.notify_video_review(uuid) cascade;

-- consume_refresh_item / consume_heart_item RPC 는 옛 큐레이션 풀 3명 반환
-- 의미였다. payments / refresh_item_grants 테이블 자체는 KEEP (결제 grant
-- 인프라 — 새 도메인의 booster 구매에 재활용 예정) 이지만 큐레이션 의미의
-- RPC 만 제거. 새 도메인은 `consume_booster_grant` 등으로 별도 RPC 작성.
drop function if exists public.consume_refresh_item() cascade;
drop function if exists public.consume_heart_item(uuid) cascade;
drop function if exists public.consume_heart_item() cascade;

-- ============================================================================
-- 3) 테이블 (CASCADE 로 정책/인덱스/외래키 함께 정리)
-- ============================================================================
drop table if exists public.curation_pool cascade;
drop table if exists public.curation_pool_views cascade;
drop table if exists public.curation_seen_users cascade;
drop table if exists public.likes cascade;
drop table if exists public.matches cascade;
drop table if exists public.conversations cascade;
drop table if exists public.messages cascade;

-- 옛 admin-console 스타일 reports (한글 컬럼) 도 함께 정리 — 새 도메인
-- reports 가 같은 이름으로 재정의된다 (clean baseline 정책).
drop table if exists public.reports cascade;

-- NOTE: public.blocks 는 본인인증/onboarding 인프라(`member_onboarding_compatibility`)
-- 에서 정의된 테이블로 옛 도메인이 아닌 도메인 무관 인프라다. 새 베이스라인은
-- 이 테이블을 그대로 재활용 (영구 차단은 unblocked_at 미사용 + unblock RPC
-- 미노출 방식으로 구현) — DROP 하지 않는다.

-- ============================================================================
-- 4) Enum 타입
-- ============================================================================
drop type if exists public.like_status cascade;
drop type if exists public.match_status cascade;
drop type if exists public.message_status cascade;

-- ============================================================================
-- 5) 옛 storage 정책 (chat-peer 가시성)
-- ============================================================================
-- profile-images 버킷의 1:1 chat-peer 가시성 정책은 새 도메인의 "방 멤버
-- 가시성" 으로 대체된다. 정책 자체는 baseline 에서 재정의하므로 여기서 drop.
drop policy if exists "profile-images visible to chat peer" on storage.objects;
drop policy if exists "profile-images: select for chat peer" on storage.objects;

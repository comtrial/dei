-- Notification type enum 정리 — 새 도메인.
--
-- 옛 도메인 enum 값(curation_ready / like_received / match_created / dm_received)
-- 은 새 도메인에선 의미가 없지만 DROP TYPE 은 의존성이 너무 많아 (notifications
-- 테이블, 트리거, 외부 함수 등) 위험. 대신 새 enum 값을 ADD 하고 클라/Edge 가
-- 새 값만 발행하도록 한다. 옛 값은 row 도 없게 되어 자연 소멸.
--
-- notification_type enum 이 존재하지 않을 가능성도 있다 (`notifications.type` 이
-- text 일 수도) — 이 경우 do-block 으로 안전하게 처리.

do $$
declare
  v_typname text;
begin
  -- notifications.type 의 도메인이 enum 인지 확인
  select pg_type.typname into v_typname
    from pg_attribute
    join pg_class on pg_class.oid = pg_attribute.attrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    join pg_type on pg_type.oid = pg_attribute.atttypid
   where pg_namespace.nspname = 'public'
     and pg_class.relname = 'notifications'
     and pg_attribute.attname = 'type'
     and pg_type.typtype = 'e';  -- enum

  if v_typname is null then
    -- enum 이 아니면 (text/varchar) 추가 작업 불필요
    return;
  end if;

  -- 새 값 추가 (IF NOT EXISTS 로 idempotent)
  execute format('alter type %I add value if not exists %L', v_typname, 'room_matched');
  execute format('alter type %I add value if not exists %L', v_typname, 'hourly_upload_reminder');
  execute format('alter type %I add value if not exists %L', v_typname, 'blur_gate_reminder');
  execute format('alter type %I add value if not exists %L', v_typname, 'blur_gate_reapplied');
  execute format('alter type %I add value if not exists %L', v_typname, 'chat_mention');
  execute format('alter type %I add value if not exists %L', v_typname, 'room_left');
  execute format('alter type %I add value if not exists %L', v_typname, 'rematch_available');
  execute format('alter type %I add value if not exists %L', v_typname, 'booster_offer');
  execute format('alter type %I add value if not exists %L', v_typname, 'room_auto_kicked');
  execute format('alter type %I add value if not exists %L', v_typname, 'room_member_kicked');
end;
$$;

/**
 * 정책 모듈 (L2 config SSOT) — spec §7 · dei-ver2 decisions.md D1~D11
 * ==================================================================
 * 매칭/방/안전/결제/알림의 *정책 값* 을 코드 한 곳에 고정한다. 화면·서버는
 * 매직 넘버를 흩뿌리지 말고 여기 상수를 참조한다.
 *
 * ⚠️ 운영 가변성: 이 값들은 본래 서버 config 테이블/feature flag 로 빼서
 * 무중단 변경되는 게 목표다(spec §7). 이번 핸드오프에서는 *타입 고정 + 기본값*
 * 까지만 제공한다. 후속에 config 테이블이 생기면 이 상수는 "기본값/폴백" 으로
 * 강등되고, 런타임은 서버 값을 우선한다. **하드코딩 가격 금지**(D11): 부스터
 * 실제 가격은 스토어/RevenueCat 콘솔이 SSOT — 여기엔 product id 만 둔다.
 *
 * 근거 매핑: 각 항목 주석의 D번호 = dei-ver2 docs/rooms-spec/decisions.md.
 */

/** 신고 사유 카테고리 (D10). reports.reason_code CHECK 와 1:1. */
export const REPORT_CATEGORIES = [
  { code: 'verbal_abuse', label: '욕설·비방' },
  { code: 'sexual_content', label: '성적·선정적 콘텐츠' },
  { code: 'fake_profile', label: '사칭·가짜 프로필' },
  { code: 'spam', label: '광고·스팸' },
  { code: 'violence_threat', label: '폭력·위협' },
  { code: 'other', label: '기타 (자유 입력)' },
] as const;

export type ReportCategoryCode = (typeof REPORT_CATEGORIES)[number]['code'];

export const POLICY = {
  // ── 매칭 (D2/D5) ────────────────────────────────────────────────
  matching: {
    /** MVP = 큐 적재 + 운영진 수동 편성 (자동 매칭은 v0.7+). (D2) */
    automation: 'manual_admin_curation' as const,
    /** 강제 조건: 성별 반대 묶음(남↔여). 큐 적재 시 required_gender 자동 계산. (D5) */
    requireOppositeGender: true,
    /** 후순위(권장) 조건. 강제 아님. (D5) */
    preferredAgeBandYears: 3,
    /** 큐 만료. 초과 시 S09(매칭 실패/만료). */
    queueExpiryHours: 24,
    /** 방 이탈 후 재매칭 제한. 여성은 결제 없이 자동 면제된다. */
    rematchCooldownHours: 24,
  },

  // ── 팀(묶음) 구성 (D4 · S06) ───────────────────────────────────
  team: {
    /** 본인 포함 최대 인원. 8셀 분할 피드 상한(우리5+상대3)과 정합. */
    maxMembers: 5,
    /** 닉네임 기반 초대 — 이미 가입된 유저만(미가입 SMS 초대는 MVP 제외). (D4) */
    inviteByNicknameOnly: true,
    /** 수락 절차 없음 — 추가 즉시 묶음 포함. (D4 · S06) */
    requireInviteAcceptance: false,
    /** 최소 인원 = 본인 1명도 가능(진입 장벽 최소, S06 결정). */
    minMembers: 1,
  },

  // ── 방 수명 (D6) ───────────────────────────────────────────────
  room: {
    /** 방 생성 후 자동 종료. (D6) */
    autoExpireDays: 7,
    /** 멤버 전원 이탈 시 즉시 종료. (D6) */
    endWhenAllLeft: true,
    /** 종료(soft) 후 hard 삭제까지 보관일. (D6) */
    hardDeleteAfterDays: 30,
    /** 한 사람당 활성 방 1개 원칙(splash 라우팅·busy 판정 근거). */
    maxActiveRoomsPerUser: 1,
    /**
     * 마지막 active 멤버 이탈 감지 후 room_ended 콜백 발화까지 대기 ms.
     * 네트워크 순간 끊김으로 인한 오판 완화용 grace period.
     * TODO(C-0b §2-1 broadcast 합의 후 제거): 클라 폴백 로직 — broadcast 채택 시 이 값 불필요.
     */
    roomEndedGraceMs: 5000,
  },

  // ── 자동 퇴장(auto-kick) (D9) ──────────────────────────────────
  autoKick: {
    /**
     * 임계값 = 대상 제외 인원의 과반. n = 방 전체 인원일 때 대상 X 제외 (n-1)
     * 명 중 ceil((n-1)/2) 명이 차단/신고하면 X 자동 퇴장.
     * 예) 6인 방 → ceil(5/2)=3.
     */
    thresholdFor: (roomMemberCount: number): number =>
      Math.ceil((roomMemberCount - 1) / 2),
    /** 임계 도달 시 room_member.status. */
    kickedStatus: 'auto_kicked' as const,
    /** 계정 정지는 자동 없음 — 운영팀 검토 큐(reports)로만. (D9) */
    autoSuspendAccount: false,
  },

  // ── 블러 게이트 (D8 · S10/S13) ─────────────────────────────────
  blurGate: {
    /** 방 활성 중 공개되는 영상의 sliding window. 이 시간 지난 영상은 재-블러. */
    visibilityWindowHours: 24,
  },

  // ── 영상 보존 (D8) ─────────────────────────────────────────────
  video: {
    /** 방 종료 후 보관(분쟁 대응) → 경과 시 hard delete. (D8) */
    retentionAfterRoomEndDays: 30,
    /** 현장 카메라 촬영만, 갤러리 금지(dei 정체성). */
    cameraOnlyNoGallery: true,
    /** 계정 삭제 요청 시 전 영상 hard delete 기한. (D8 · GDPR/개보법) */
    purgeOnAccountDeletionHours: 24,
    /** 업로드 해상도 상한 — 3초 영상에 4K 불필요. (C-1 §3-3) */
    maxResolution: { w: 1280, h: 720 } as const,
    /** 업로드 bitrate 상한 kbps — 3초×2Mbps≈750KB. (C-1 §3-3) */
    maxBitrateKbps: 2000,
    /** 영상 최대 길이 ms — dei 3초 영상 정체성. (C-1 §3-3) */
    maxDurationMs: 3000,
    /** 업로드 파일 크기 상한 bytes — 3MB 초과 시 클라 거부. (C-1 §3-3) */
    maxFileSizeBytes: 3 * 1024 * 1024,
    /** 썸네일 jpg 크기 상한 bytes — 셀 표시용 50KB 충분. (C-1 §3-4) */
    thumbnailMaxSizeBytes: 50 * 1024,
    /** prefetch 대상 sibling 수 — 직전·직후 각 1개. (C-1 §4-4) */
    prefetchSiblingCount: 1,
  },

  // ── 알림 (D3) ──────────────────────────────────────────────────
  notifications: {
    /** 정기 알림 발송 제외(새벽). KST 기준 [start, end). (D3) */
    quietHours: { startHourKst: 0, endHourKst: 7 },
    /**
     * quietHours 예외 — 사용자 액션 직접 트리거 알림은 시간 무관 발송. (D3)
     * (방 매칭 완료 / @멘션 귓속말 등)
     */
    quietHoursExempt: ['room_matched', 'whisper_mention'] as const,
  },

  // ── 결제 / 부스터 (D1/D11 · S17) ───────────────────────────────
  payment: {
    /** "무료 커뮤니티" 가 코드 기본 전제. 결제는 flag 로 disable 가능. (D1) */
    model: 'free_community' as const,
    /** 바로매치(24h 재매칭 제한 해제 1회) product id. 가격은 콘솔이 SSOT. (D11) */
    instantRematchProductId: 'booster_instant_rematch_v1',
    /** 여성은 무료 — booster_grants 자동 생성. (D11) */
    femaleInstantRematchFree: true,
  },

  // ── 본인인증·연령 게이트 (D1 · S02/S03) ────────────────────────
  identity: {
    /** 본인인증(PortOne) 통과 시 profile.is_adult = true 만 통과. (D1) */
    minAge: 19,
    /** 본인인증 연속 실패 잠금(S03 결정). */
    maxConsecutiveFailures: 5,
    lockoutHours: 24,
    /** 탈퇴 후 동일 CI 재가입 제한(S20 결정). */
    rejoinLockDays: 30,
    /** 닉네임 변경 throttle(S04 결정). */
    nicknameChangeThrottleDays: 30,
  },

  // ── grid 렌더 성능 (C-2) ────────────────────────────────────────
  gridPerformance: {
    realtimeDebounceMs: 100,
    queryStaleTimeMs: 50 * 60 * 1000,
    prefetchHourRange: 3,
    appStateStaleAfterMs: 5 * 60 * 1000,
  },

  // ── 킬스위치 / 롤아웃 (spec §7) ────────────────────────────────
  flags: {
    /** 전체 매칭 중단 비상 스위치(운영). 기본 off=정상. */
    killSwitchMatching: false,
    /** 결제 모듈 노출(무료 커뮤니티 전제라 기본 off). (D1) */
    enablePayments: false,
  },
} as const;

export type Policy = typeof POLICY;

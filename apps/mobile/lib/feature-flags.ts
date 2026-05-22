/**
 * Feature flag 타입 + 헬퍼.
 *
 * 서버 RPC `evaluate_my_flags()` 가 `{ flagKey: value }` jsonb 를 반환한다.
 * value 는 boolean(on/off) 또는 문자열(variant). 분기 규칙(조건/비율)은 admin 이
 * Supabase 의 feature_flags/feature_flag_rules 에서 원격 조정 — 앱 재배포 불요.
 */

/** flag 결과값: on/off 또는 variant 문자열. */
export type FlagValue = boolean | string;

/**
 * 알려진 flag key. 새 flag 를 쓰면 여기에 추가(자유 문자열도 동작하지만 타입
 * 안전을 위해 선언 권장).
 *   - home_top_layout: 홈 상단 영역 variant ('A'|'B'|'C')
 *   - curation_layout: 홈 큐레이션 레이아웃 ('stack3'|'single')
 */
export type FlagKey = 'home_top_layout' | 'curation_layout' | (string & {});

export type FlagMap = Record<string, FlagValue>;

/** flags 에서 key 값을 안전하게 읽는다. 없으면 fallback. */
export function getFlag(
  flags: FlagMap | null | undefined,
  key: FlagKey,
  fallback: FlagValue,
): FlagValue {
  if (!flags) return fallback;
  const v = flags[key];
  return v === undefined || v === null ? fallback : v;
}

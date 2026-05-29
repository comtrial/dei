/**
 * ⚠️ HANDOFF STUB — PortOne 본인인증/결제 (D-12, 이번 셋팅에서 미구현)
 * ==================================================================
 * 담당: 본인인증 흐름(S03/S03f) = B / 결제(S17/S18 부스터) = B.
 * `@portone/react-native-sdk` 는 package.json 에 *참고용* 으로만 남아있고
 * (다른 개발자가 붙임), 이 셋팅에서는 호출부를 묶지 않는다.
 *
 * 인증 결과(실명·생년월일·성별·CI)는 프로필 root of trust 이며(S03 → S04
 * 성별·생년월일 lock), 서버 측 콜백 검증 Edge Function 으로 CI 해시를 저장한다
 * (auth_verification 테이블). 이 stub 은 그 경계 시그니처만 고정한다.
 */
const HANDOFF = 'handoff: PortOne 본인인증/결제(B) 구현 예정';

/** PortOne 본인인증 결과(서버 검증 후 신뢰). */
export interface IdentityVerificationResult {
  realName: string;
  birthDate: string; // YYYY-MM-DD
  gender: 'male' | 'female';
  ci: string; // 연계정보(중복 가입 판별 키) — 서버에서 해시 저장
  isAdult: boolean;
}

/** 본인인증 SDK 호출 → 인증기관 이탈 → 콜백. 결과는 서버 재검증 필수. */
export async function startIdentityVerification(): Promise<IdentityVerificationResult> {
  throw new Error(HANDOFF);
}

/** 부스터(바로매치) 결제 시작. 가격은 하드코딩 금지(스토어/RevenueCat 콘솔). */
export async function purchaseInstantRematch(_userId: string): Promise<{ ok: boolean }> {
  throw new Error(HANDOFF);
}

# PortOne 본인확인 중심 인증 개발 범위

Last updated: 2026-05-06

## 결정

Dei의 현재 가입 흐름은 전달받은 HTML 티켓의 L1-L7 구조를 따른다. 카카오 로그인은 MVP 인증 흐름에서 제거하고, 약관 동의 후 Supabase 익명 세션을 생성한 뒤 PortOne 본인확인으로 사용자 소유 휴대폰/CI/DI를 확인한다.

PortOne은 Supabase Auth provider가 아니므로, 앱 세션은 Supabase Auth가 담당한다. PortOne은 본인 명의 확인과 중복 가입 방지에만 사용한다.

성인 인증은 이번 범위에서 제외한다. PortOne 결과는 "본인 명의 확인" 용도로만 사용하고, 나이 기반 차단 정책은 이후 별도 단계에서 다시 결정한다.

## 역할 구분

| 역할 | 선택 | 비고 |
| --- | --- | --- |
| 앱 세션 | Supabase anonymous auth | 약관 동의 후 임시 세션 생성 |
| 본인 명의 확인 | PortOne Identity Verification | 인증 결과는 Supabase Edge Function에서 서버 검증 |
| 내부 사용자 기준 | Supabase Auth user id | `auth.users.id`를 모든 도메인 테이블의 기준으로 사용 |
| 중복 계정 기준 | PortOne CI/DI/phone hash | 동일 본인확인 정보 재가입 차단 |
| 성인 인증 | 제외 | `age_eligible`은 현재 게이트에서 제외 |

## 이번 범위에 포함

- L1 스플래시와 세션 확인
- L2 서비스 소개 온보딩
- L3 약관 동의 바텀시트
- L4 약관 상세
- L5/L6 PortOne 본인확인 시작/결과 확인
- L7 인증 실패 다이얼로그
- PortOne React Native SDK 설치와 앱 플러그인 설정
- 본인확인 시작 Edge Function
- 본인확인 완료 확인 Edge Function
- PortOne API secret은 앱에 넣지 않고 Edge Function secret으로만 사용
- `identity_verifications`에 PortOne 요청/결과 상태 저장
- `private_profiles.phone_hash`, `ci_hash`, `di_hash`에 식별 hash 저장
- `account_status.identity_verified_at` 업데이트
- 성인 인증 제외에 맞춰 프로필/디스커버리 게이트에서 `age_eligible` 요구 제거
- 개발 중 PortOne 키가 없을 때 로컬 전용 본인확인 완료 버튼 제공

## 이번 범위에서 제외

- 카카오 로그인
- 앱 내 SMS OTP 코드 입력
- PortOne 성인 인증 정책
- 나이 미달 차단
- 1계정 1기기 강제 정책
- RevenueCat/IAP
- 운영자 콘솔에서 본인확인 이력 조회 UI

## 필요한 외부 설정

### Supabase

- Anonymous sign-ins 활성화
- Project URL
- anon public key
- Edge Function 배포

### PortOne

- PortOne 가입
- 본인인증 채널 계약
- `PORTONE_STORE_ID`
- `PORTONE_IDENTITY_CHANNEL_KEY`
- `PORTONE_API_SECRET`
- `PHONE_HASH_SALT`

Edge Function secret 설정 예:

```bash
supabase secrets set \
  PORTONE_STORE_ID=... \
  PORTONE_IDENTITY_CHANNEL_KEY=... \
  PORTONE_API_SECRET=... \
  PHONE_HASH_SALT=...
```

## 개발 메모

- PortOne secret이 없으면 본인확인 시작 Edge Function은 설정 오류를 반환한다.
- 로컬 개발에서는 `개발자 전용: 본인확인 완료 처리` 버튼으로 P1-P4 흐름을 확인한다.
- PortOne SDK 플러그인이 추가되었기 때문에 Dev Client 재빌드가 필요하다.
- 실제 전화번호 원문은 DB에 저장하지 않는다. hash와 국가 코드만 저장한다.
- 기존 회원 로그인/복구를 PortOne만으로 완성하려면 익명 세션을 실제 기존 user로 전환하는 별도 서버 설계가 필요하다.

# 카카오 로그인 + PortOne 본인확인 개발 범위

Last updated: 2026-05-01

## 결정

Dei의 현재 인증 개발 방향은 카카오 로그인으로 앱 계정을 만들고, PortOne으로 본인 명의 휴대폰 확인을 붙이는 구조다.

성인 인증은 이번 범위에서 제외한다. PortOne 결과는 "본인 명의 확인" 용도로만 사용하고, 나이 기반 차단 정책은 이후 별도 단계에서 다시 결정한다.

## 역할 구분

| 역할 | 선택 | 비고 |
| --- | --- | --- |
| 로그인/세션 | Kakao Login through Supabase Auth | 카카오 OAuth 결과로 Supabase user/session 생성 |
| 본인 명의 확인 | PortOne Identity Verification | 인증 결과는 Supabase Edge Function에서 서버 검증 |
| 내부 사용자 기준 | Supabase Auth user id | `auth.users.id`를 모든 도메인 테이블의 기준으로 사용 |
| 성인 인증 | 제외 | `age_eligible`은 현재 게이트에서 제외 |

## 이번 범위에 포함

- 카카오 OAuth 로그인
- Supabase Auth Kakao provider 기반 세션 생성
- 약관 동의 후 PortOne 본인확인 화면 진입
- PortOne React Native SDK 설치와 앱 플러그인 설정
- 본인확인 시작 Edge Function
- 본인확인 완료 확인 Edge Function
- PortOne API secret은 앱에 넣지 않고 Edge Function secret으로만 사용
- `identity_verifications`에 PortOne 요청/결과 상태 저장
- `private_profiles.phone_hash`에 휴대폰 번호 hash 저장
- `account_status.identity_verified_at` 업데이트
- 성인 인증 제외에 맞춰 프로필/디스커버리 게이트에서 `age_eligible` 요구 제거

## 이번 범위에서 제외

- SMS OTP 로그인
- PortOne 성인 인증 정책
- 나이 미달 차단
- 1계정 1기기 강제 정책
- RevenueCat/IAP
- 운영자 콘솔에서 본인확인 이력 조회 UI

## 필요한 외부 설정

### Kakao

- Kakao Developers 앱 생성
- 카카오 로그인 활성화
- REST API key 확인
- Client secret 발급 및 활성화
- Redirect URI 등록
- Supabase Dashboard Auth provider에 Kakao key/secret 입력

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

- 카카오 provider 설정 전에는 앱의 개발용 이메일 OTP 버튼으로 로컬 흐름을 계속 확인한다.
- PortOne secret이 없으면 본인확인 시작 Edge Function은 설정 오류를 반환한다.
- PortOne SDK 플러그인이 추가되었기 때문에 Dev Client 재빌드가 필요하다.
- 실제 전화번호 원문은 DB에 저장하지 않는다. hash와 국가 코드만 저장한다.

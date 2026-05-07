# Onboarding Profile Data Contract

이 문서는 P1~P4 온보딩 구현에 필요한 DB 테이블, 컬럼, Storage 버킷을 팀 공유용으로 정리한 것이다.

## 화면 흐름

| 단계 | 화면 | 저장 시점 |
| --- | --- | --- |
| P1 | 기본 프로필 | P3 완료 시 `complete_profile` RPC에서 함께 저장 |
| P2 | 상세 프로필 | P3 완료 시 `complete_profile` RPC에서 함께 저장 |
| P3 | 관심사 | `complete_profile` RPC 실행 |
| P4 | 로그 안내 | `onboarding_state = log_intro`로 유지 후 `complete_log_intro` RPC 실행 |

## `public.profiles`

공개 프로필과 추천/탐색에 필요한 비민감 정보를 저장한다.
원격 Supabase의 기존 `profiles` 테이블을 재활용하므로 앱 입력명과 DB 컬럼명이 일부 다르다.

| 컬럼 | 타입 | 용도 | 필수 여부 |
| --- | --- | --- | --- |
| `user_id` | `uuid` | `auth.users.id`와 1:1 매핑 | 필수 |
| `nickname` | `text` | 앱의 `display_name`, 닉네임 | 필수 |
| `gender` | `text` | 앱의 `여성/남성`을 서버에서 `F/M`으로 변환 저장 | 필수 |
| `birth_date` | `date` | 생년월일. 운영/검색용 기존 컬럼 유지 | 필수 |
| `intro` | `text` | 앱의 `bio`, 자기소개 최대 200자 | 선택 |
| `region_sido` | `text` | 시/도 | 필수 |
| `region_sigungu` | `text` | 시/군/구 | 필수 |
| `mbti` | `text` | MBTI 또는 `모름` | 선택 |
| `photo_url` | `text` | `profile-images` 버킷의 객체 경로 | 선택 |
| `interest_categories` | `text[]` | 선택 태그의 상위 카테고리 목록 | 필수 |
| `interest_tags` | `text[]` | 관심사 태그, 3~10개 | 필수 |
| `사진_검수_YN` | `char(1)` | 운영자 사진 검수 상태 | 시스템 관리 |
| `회원상태` | `text` | 기존 관리자 콘솔의 회원 상태 | 시스템 관리 |
| `차단_YN` | `char(1)` | 기존 관리자 콘솔의 차단 여부 | 시스템 관리 |

## `public.private_profiles`

민감하거나 공개하면 안 되는 개인 정보를 저장한다.

| 컬럼 | 타입 | 용도 | 비고 |
| --- | --- | --- | --- |
| `user_id` | `uuid` | `auth.users.id`와 1:1 매핑 | 필수 |
| `birth_date` | `date` | 생년월일 | 본인확인/중복판단용 개인 정보 영역에도 중복 저장 |
| `phone_hash` | `text` | PortOne 본인확인 휴대폰 해시 | Edge Function만 갱신 |
| `ci_hash` | `text` | 계정 중복 판단용 CI 해시 | unique index 적용 |
| `di_hash` | `text` | 보조 중복 판단용 DI 해시 | index 적용 |

## `public.account_status`

온보딩 게이트와 계정 상태를 판단한다.

| 컬럼 | 타입 | 용도 |
| --- | --- | --- |
| `user_id` | `uuid` | 계정 식별자 |
| `onboarding_state` | `onboarding_state` | 현재 온보딩 단계 |
| `identity_verified_at` | `timestamptz` | PortOne 본인확인 완료 시각 |
| `profile_completed_at` | `timestamptz` | P1~P3 저장 완료 시각 |
| `first_video_uploaded_at` | `timestamptz` | 첫 로그 업로드 시각 |

`onboarding_state`는 `terms` → `phone`/`identity_verification` → `profile` → `log_intro` → `first_video` → `video_review` → `complete` 순서로 사용한다. P4는 재접속해도 건너뛰지 않도록 `log_intro` 상태로 별도 저장한다.

## Storage

| 버킷 | 공개 여부 | 용도 | 경로 규칙 |
| --- | --- | --- | --- |
| `profile-images` | private | 프로필 사진 1장 업로드 | `{user_id}/profile-{timestamp}.{ext}` |
| `profile-videos` | private | 첫 2초 로그 영상 | 기존 정책 유지 |

`profile-images`는 본인 폴더만 insert/select/update/delete 가능하고, 관리자는 전체 접근 가능하다.

## RPC

### `public.complete_profile`

앱에서 P3 완료 시 호출한다.

| 인자 | 출처 |
| --- | --- |
| `p_display_name` | P1 닉네임 |
| `p_gender` | P1 성별. `여성/남성` 입력을 `F/M`으로 저장 |
| `p_birth_date` | P1 생년월일 |
| `p_region_sido` | P1 시/도 |
| `p_region_sigungu` | P1 시/군/구 |
| `p_bio` | P2 자기소개. `profiles.intro`로 저장 |
| `p_mbti` | P2 MBTI |
| `p_profile_image_path` | P2 프로필 사진 Storage 경로. `profiles.photo_url`로 저장 |
| `p_interest_categories` | P3 선택 태그의 카테고리 |
| `p_interest_tags` | P3 선택 태그 |

서버에서도 필수값을 검증한다.

| 필수 검증 | 조건 |
| --- | --- |
| 닉네임 | 공백 제거 후 1자 이상 |
| 생년월일 | `1900-01-01` 이상, 오늘 이하 |
| 성별 | 공백 제거 후 1자 이상 |
| 지역 | 시/도와 시/군/구 모두 필요 |
| 관심사 | 3~10개 |

완료 시 `account_status.profile_completed_at`을 채우고 `onboarding_state`를 `log_intro`로 넘긴다.

### `public.complete_log_intro`

앱에서 P4 마지막 CTA인 `첫 로그 촬영하기`를 누를 때 호출한다. `identity_verified_at`과 `profile_completed_at`이 모두 있어야 하며, 성공 시 `onboarding_state`를 `first_video`로 넘긴다.

## 기존회원/중복 본인확인 처리

PortOne 인증 결과의 CI/DI/휴대폰 해시가 다른 사용자와 일치하면 Edge Function은 신규 가입을 계속 진행하지 않는다. 응답은 `409`과 함께 `code = EXISTING_MEMBER_FOUND`, `resolution = existing_member_recovery_required`를 내려 앱이 “기존 회원 정보 확인” 안내를 띄운다.

현재 MVP 구현은 보안상 익명 세션을 기존 Supabase 사용자 세션으로 자동 교체하지 않는다. 실제 기존회원 로그인/복구까지 완성하려면 별도 계정 연결 또는 복구 플로우가 필요하다.

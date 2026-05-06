# Dei 기술 스택 결정안

Last updated: 2026-04-30

이 문서는 Dei MVP 기준 기술 스택과 운영상 판단이 필요한 지점을 정리한다.

## Stack Summary

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 앱 | Expo Dev Client + React Native | Expo Go 미사용 |
| 백엔드 | Supabase 단독 | Postgres + Auth + Storage + Realtime + Edge Functions |
| 빌드/배포 | EAS Free, Week 3부터 Pro 검토 | MacBook Air 로컬 스펙과 시뮬레이터 부담을 보고 결정 |
| 비디오 저장/재생 | Supabase Storage + signed URL | Cloudflare Stream 미사용 |
| 카메라 | react-native-vision-camera | 정확히 2초 녹화, H.264 강제 |
| 본인인증 | PortOne | Day 1 계약 신청 필수 |
| 모더레이션 | 운영자 수동 + Slack 웹훅 | 자동 모더레이션은 정식 출시 직전 도입 |
| 결제 (IAP) | RevenueCat + StoreKit 2 + Play Billing | 정식 출시에 포함 |
| 푸시 | Expo Push | 인증 사용자 기준으로 토큰 등록 |
| 에러 추적 | Sentry | React Native + Edge Functions + Next.js 통합 |
| 제품 분석 | PostHog | 퍼널, 리텐션, 결제 전환 |
| 관리자 콘솔 | Next.js + Vercel | 운영자 검수, 신고/차단, 계정 상태 관리 |
| App Attest | MVP 제외 | 정식 출시 후 도입 |

## MVP 기준 포함

- Expo Dev Client 기반 모바일 앱
- Supabase Auth, Postgres, Storage, Realtime, Edge Functions
- Supabase Storage signed URL 기반 비디오 업로드/재생
- `react-native-vision-camera` 기반 2초 프로필 비디오 촬영
- PortOne 본인인증 연동
- 운영자 수동 모더레이션과 Slack 웹훅 알림
- Expo Push
- Sentry 에러 추적
- PostHog 제품 분석
- Next.js + Vercel 관리자 콘솔

## MVP 이후 또는 정식 출시 포함

- RevenueCat + StoreKit 2 + Play Billing 기반 IAP
- 자동 모더레이션
- App Attest
- EAS Pro 전환 여부 결정

## 운영 메모

- Expo Go는 사용하지 않는다. 카메라, 푸시, RevenueCat 같은 네이티브 기능을 고려해 Dev Client를 기준으로 개발한다.
- EAS 요금제는 Week 3 시점에 실제 빌드 빈도, 팀 역할, 로컬 장비 부담을 보고 다시 판단한다.
- 비디오는 Cloudflare Stream 없이 Supabase Storage에 저장하고 signed URL로 접근한다.
- 본인인증은 외부 계약이 필요한 영역이므로 Day 1에 PortOne 계약 신청을 진행한다.
- 자동 모더레이션은 MVP 범위에서 제외하고, 정식 출시 직전 도입을 검토한다.

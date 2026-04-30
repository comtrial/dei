# Dev1 Sign In / Sign Up Workspace

이 폴더는 변경규님 담당 범위인 가입/본인인증, 매칭/DM, 신고/차단, 푸시 알림, 결제를 장기적으로 추적하기 위한 작업 공간입니다.

## Source Of Truth

- 팀 개발 규칙: `CLAUDE.md`
- 앱 디자인 시스템: `apps/mobile/components/ui`, `apps/mobile/global.css`, `apps/mobile/tailwind.config.js`
- 모바일 앱: `apps/mobile`
- Supabase 스키마: `supabase/migrations`
- 초기 판단 문서: `docs/auth-verification-kickoff.md`
- 전달받은 컨셉 HTML: `/Users/qusrudrb/Downloads/dei - Sign Flow _standalone_.html`

## Current Direction

현재 방식은 완성된 Figma 전달을 기다리는 대신, RNR + NativeWind 디자인 시스템을 코드 기준으로 고정하고 기능 개발과 UI 구현을 함께 진행합니다.

Sign flow HTML은 그대로 앱에 복사하는 대상이 아니라, 화면 순서와 UX 요구사항을 해석하는 참고 문서입니다. 구현은 `components/ui`의 공용 컴포넌트와 디자인 토큰을 기준으로 맞춥니다.

## Current App Reality

- 로컬 개발은 이메일 OTP와 개발용 코드로 빠르게 로그인합니다.
- 실서비스 목표는 휴대폰 기반 진입과 PortOne 본인/성인 인증입니다.
- DB에는 가입, 약관, 본인 인증, 신고/차단, 관리자 반영을 고려한 기반 테이블이 먼저 잡혀 있습니다.
- 영상 촬영/업로드/검수 UI는 다른 담당 영역입니다. Dev1에서는 매칭/DM 진입 조건으로 승인 상태를 읽거나 차단하는 정도만 연동합니다.
- 매칭, DM, 푸시, 결제는 검증된 사용자 상태와 안전 게이트 위에 붙이는 후속 작업입니다.

## How To Use

작업 전후로 아래 문서를 갱신합니다.

- `test-plan.md`: 로컬/원격/외부연동 테스트 체크리스트
- `open-questions.md`: 팀에 물어봐야 할 결정사항
- `git-intake.md`: 팀이 올린 내용 확인 기록

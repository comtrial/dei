# 모바일 환경변수 설정

모바일 앱을 실행하려면 각 개발자 PC에 로컬 환경변수 파일이 필요합니다.

아래 위치에 파일을 만들어 주세요:

```text
apps/mobile/.env
```

파일 내용은 아래 형태로 작성합니다:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 값은 어디서 받나요

팀에서 사용하는 Supabase 프로젝트 값을 넣으면 됩니다.

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key

이 두 값은 앱이 팀 공용 Supabase 프로젝트에 접속할 때 쓰는 연결 설정입니다.
DB 비밀번호가 아닙니다.

## 여기에 넣으면 안 되는 값

모바일 앱의 `.env` 파일에는 아래 값을 절대 넣지 마세요:

- Supabase service role key
- Supabase database password
- PortOne secret key
- RevenueCat secret key
- 관리자/서버 전용 비밀 키

## 새 컴퓨터에서 시작하는 방법

```bash
git checkout byungg/featrue-20260426-1
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

그 다음 `apps/mobile/.env` 파일을 열어서 팀 Supabase 값을 채워 넣으면 됩니다.

로컬 Supabase로 개발할 때는 아래 명령을 사용합니다:

```bash
pnpm db:start
pnpm db:reset
pnpm --dir apps/mobile exec expo start --dev-client
```

Android는 에뮬레이터를 켠 뒤 Expo에서 앱을 열면 됩니다.

## 참고

`apps/mobile/.env`는 Git에 올라가지 않도록 일부러 제외되어 있습니다.
각 개발자가 자기 컴퓨터에만 따로 가지고 있어야 합니다.

Git에는 `apps/mobile/.env.example` 파일과 이 안내 문서만 올립니다.

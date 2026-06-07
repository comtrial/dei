# App Store 심사 제출용 텍스트 초안 (dei)

> 이 문서는 **App Store Connect 제출용 텍스트의 초안**이다. 실제 제출 전
> `[채워넣기]` / `[개발자 확인 필요]` placeholder 를 모두 채우고, 코드 기준과
> 다른 부분이 생기면 코드 흐름(아래 "근거가 된 화면 흐름")에 맞춰 수정한다.
>
> 작성 기준일: 2026-06-07 · 작성 근거: `apps/mobile/app/**` 실제 라우트/화면
> (라인 단정이 아니라 흐름 기준). 과장·미검증 기능 주장 금지.

---

## 0. 근거가 된 화면 흐름 (요약 — 심사 메모/설명의 사실 근거)

실제 코드(`lib/routes.ts` + 각 화면)에서 확인된 동선:

1. **앱 첫 실행 (S01 splash, `app/index.tsx`)** — 부트스트랩 라우팅. 세션 없으면
   약관 화면으로 보냄. 세션은 **익명 로그인(anonymous)** 기반으로 시작된다.
2. **약관 + 19+ 자가확인 (S02, `app/(auth)/terms.tsx`)** — 서비스 이용약관·개인정보
   처리방침(필수), 위치·마케팅(선택) 동의. "만 19세 이상 전용" 명시.
3. **본인인증 (S03, `app/(auth)/verify.tsx`)** — **PortOne 휴대폰 본인인증**
   (NICE/KCB). 실명·생년월일·성별·CI 확보, 19+ 연령 게이트, CI 중복 시 기존
   계정 강제. 익명 세션을 인증된 계정으로 승격(promoteWithIdentity).
4. **프로필 작성 3단계 (`app/(onboarding)/profile/step1~3`)**
   - step1: 닉네임 · 성별 (생년월일은 본인인증 결과로 자동 채움·잠금)
   - step2: **프로필 사진 업로드 + 자기소개(bio)**
   - step3: **활동 지역(region)** — 위치 권한 동의 시 자동 추천
5. **홈 (S05, `app/(app)/home.tsx`)** — "혼자 참여" 또는 "친구와 함께"로 매칭 큐 진입.
6. **매칭 큐 (S07/S09, `app/(app)/queue.tsx`)** — 대기 → 매칭.
7. **대화방 (S13, `app/(app)/room/[roomId]/`)**
   - 방 그리드 / 일상 **영상 촬영·업로드**(`upload.tsx` → `recordClip`), 영상 재생
   - **단체 채팅 + @멘션 귓속말**(`chat.tsx`), realtime
   - **멤버 신고·차단**(`app/(app)/report/block-report.tsx`, `[targetId].tsx`)
8. **부스터 / 바로 매치 (S17, `app/(app)/booster.tsx`)** — **PortOne 결제**로 방
   이탈 후 24h 재매칭 제한을 즉시 면제(1회 결제, 정기결제 아님). 잔여 패스 사용 가능.

> ⚠️ 심사관 입장: 앱은 익명 로그인으로 시작하지만 **매칭/대화방 등 핵심 기능에는
> 한국 휴대폰 본인인증(PortOne)이 필요**하다. 심사관은 한국 휴대폰이 없을 수
> 있으므로 **본인인증 우회 또는 데모 계정 제공이 필수**다 (아래 §1-C 참조).

---

## 1. App Review Notes 초안 (영문 + 한글)

> App Store Connect → App Review Information → Notes 에 붙여넣을 텍스트.
> 심사관은 영문을 읽으므로 **영문 본문 + 한글 병기**.

### 1-A. English (primary — paste this)

```
== App Overview ==
"dei" is an anonymous-first social/matching app for adults (19+) in Korea.
On first launch the app signs the user in ANONYMOUSLY (no email/password
required), then walks them through onboarding and identity verification
before the core matching features unlock.

== How to reach the core features (step by step) ==
1. Launch the app. It starts on a splash screen and signs in anonymously.
2. Agree to Terms + the "19+ self-confirmation" screen.
3. Identity Verification (PortOne): the app requires Korean phone identity
   verification (NICE/KCB) to confirm real name / birth date / gender and
   the 19+ age gate.  >>> SEE THE IMPORTANT NOTE BELOW — a reviewer without a
   Korean phone number cannot pass this step without our help. <<<
4. Profile setup (3 steps): nickname & gender (birth date is auto-filled and
   locked from the identity result), profile photo + short bio, activity region.
5. Home: choose "Solo" or "With friends" to enter the matching queue.
6. Matching queue -> Room: once matched, users share short everyday videos,
   chat in a group room (with @mention whispers), and can report/block members.
7. Booster ("Instant Match"): an OPTIONAL one-time purchase that waives the
   24-hour re-match cooldown after leaving a room. This is a one-time payment,
   not a subscription.

== IMPORTANT: Identity Verification for review ==
The identity step uses real Korean phone verification and cannot be completed
with a non-Korean phone number. For App Review we will provide ONE of the
following — [개발자 확인 필요 / DEVELOPER TO CONFIRM which one]:
  (a) A review build in which identity verification is bypassed via a build
      flag, OR
  (b) A pre-verified demo account that skips identity verification.
Demo credentials / phone / verification code: [채워넣기 / FILL IN].

== Payments / Booster ==
The Booster ("Instant Match") purchase is currently implemented via PortOne.
[개발자 확인 필요] If this build ships with Apple In-App Purchase, it can be
tested with a sandbox tester account: [채워넣기 / FILL IN sandbox account].
Booster is optional and not required to evaluate the core experience.

== Safety / UGC ==
User-generated content (photos, short videos, chat) is present. The app
includes in-app report and block for members, and a 19+ age gate enforced
at identity verification.

== Contact ==
Reviewer contact: [채워넣기 / FILL IN name, email, phone].
```

### 1-B. 한글 (병기)

```
== 앱 개요 ==
"dei" 는 만 19세 이상 대상의 익명 기반 소셜/매칭 앱이다. 첫 실행 시 이메일/비밀번호
없이 익명 로그인으로 시작하고, 온보딩과 본인인증을 거친 뒤에야 핵심 매칭 기능이
열린다.

== 핵심 기능 접근 동선 ==
1. 앱 실행 → 스플래시 → 익명 로그인 자동 시작.
2. 약관 동의 + 19+ 자가확인.
3. 본인인증(PortOne, NICE/KCB 휴대폰 인증) — 실명/생년월일/성별/19+ 확인.
   >>> 한국 휴대폰이 없는 심사관은 이 단계를 통과할 수 없으므로 우회/데모 계정 필요 <<<
4. 프로필 3단계: 닉네임·성별(생년월일은 인증값 자동·잠금) → 사진+자기소개 → 활동 지역.
5. 홈: "혼자 참여" 또는 "친구와 함께"로 매칭 큐 진입.
6. 매칭 큐 → 대화방: 일상 영상 공유, 단체 채팅(@멘션 귓속말), 멤버 신고·차단.
7. 부스터(바로 매치): 방 이탈 후 24시간 재매칭 제한을 즉시 면제하는 선택적 1회 결제.

== 본인인증 (심사용) ==
본인인증은 실제 한국 휴대폰 인증이라 비-한국 번호로는 통과 불가.
심사용으로 (a) 빌드 플래그로 본인인증 우회 빌드 제공 또는 (b) 사전 인증된 데모 계정
제공 — 둘 중 무엇으로 할지 [개발자 확인 필요]. 데모 자격증명/전화번호/인증코드: [채워넣기].

== 결제 / 부스터 ==
부스터는 현재 PortOne 결제로 구현. [개발자 확인 필요] Apple IAP 전환 빌드라면
샌드박스 테스터 계정으로 검증 가능: [채워넣기]. 부스터는 선택사항이며 핵심 평가에 불필요.

== 안전 / UGC ==
사진·짧은 영상·채팅 등 사용자 생성 콘텐츠 존재. 멤버 신고·차단 기능과
본인인증 단계의 19+ 연령 게이트 포함.

== 연락처 ==
심사 담당자: [채워넣기 — 이름/이메일/전화].
```

### 1-C. 본인인증 우회/데모 — 개발자 액션 (★중요, grep 결과 반영)

코드 grep 결과를 근거로 한 **현재 사실 상태**:

- `.env` 에 **`EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS=true`** 플래그가 정의돼 있고,
  `apps/mobile/EAS-QA.md` 는 "본인인증은 `IDENTITY_BYPASS=true` 라 우회"라고 적고 있다.
- 그러나 **이 환경변수를 실제로 읽어 본인인증을 건너뛰는 코드는 리포지토리 어디에도
  없다** (`apps/mobile`, `packages`, `supabase/functions` 전체에서
  `ENABLE_DEV_IDENTITY_BYPASS` 소비처 0건). 즉 **현재 플래그는 선언만 돼 있고
  동작하지 않는다(dead flag).** `app/(auth)/verify.tsx` 는 무조건 PortOne SDK 를 호출한다.
- 따라서 **"플래그만 켜면 심사용 우회됨" 으로 신뢰하면 안 된다.**

→ **심사 빌드 전 개발자가 택1 (★`[개발자 확인 필요]`):**
   - **(a) 우회 경로를 실제로 구현**: `verify.tsx`(또는 `portone.stub.ts`)에서
     `EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS` 가 true 일 때 PortOne 을 건너뛰고
     더미 인증 결과로 프로필 단계로 진입시키는 분기를 추가. **단, 이 우회 빌드가
     실수로 프로덕션/심사 외 배포에 섞이지 않게 게이트(별도 EAS 프로파일)** 필요.
   - **(b) 데모 계정 제공**: 본인인증이 완료된(`auth_verification.status='verified'`)
     테스트 계정을 사전 생성하고, 심사관이 그 계정으로 바로 들어오게 한다.
     익명 로그인 기반이라 계정 주입 방식은 `[개발자 확인 필요]`
     (예: 딥링크/로그인 우회 화면 또는 미리 시드된 세션).
   - 어느 쪽이든 **심사용 동선이 핵심 기능(매칭→대화방→영상/채팅)까지 닿는지**
     심사 빌드에서 직접 확인 후 Notes 의 `[채워넣기]` 를 채운다.

---

## 2. 앱 설명 (Description) 초안 — 한글

> App Store Connect → Description. 과장 금지, 실제 구현된 기능만.

```
dei 는 오늘 하루의 일상을 짧은 영상과 대화로 나누는, 만 19세 이상 전용 소셜·매칭
앱입니다. 거창한 프로필 대신 "지금의 나"를 자연스럽게 보여주고, 혼자서도 친구와
함께도 부담 없이 새로운 사람과 연결될 수 있도록 설계했습니다.

시작은 간단합니다. 앱을 켜면 별도의 가입 절차 없이 바로 둘러볼 수 있고, 닉네임과
사진, 짧은 자기소개, 활동 지역만으로 나를 표현하는 프로필을 만듭니다. 안전한
커뮤니티를 위해 본인인증으로 만 19세 이상 여부를 확인합니다.

홈에서 "혼자 참여" 또는 "친구와 함께"를 선택하면 매칭 큐에 들어가고, 매칭이 되면
대화방이 열립니다. 대화방에서는 오늘의 일상을 짧은 영상으로 공유하고, 단체 채팅과
@멘션 귓속말로 자연스럽게 이야기를 이어갈 수 있습니다.

매칭은 직접 만든 프로필과 활동 지역을 바탕으로 이뤄집니다. 더 빨리 새 인연을
만나고 싶다면, 방을 나간 뒤 재매칭 대기 시간을 즉시 면제하는 "바로 매치"를
선택적으로 이용할 수 있습니다. 1회성 결제이며 정기결제가 아닙니다.

안전하게 쓸 수 있도록 신경 썼습니다. 불쾌한 상대는 언제든 신고하거나 차단할 수
있고, 본인인증 기반의 연령 게이트로 미성년자 이용을 제한합니다.

오늘 하루, 누군가의 일상으로. dei 와 함께 자연스럽게 시작해보세요.
```

> 검증 메모: 위 5~6문단의 모든 기능 주장(익명 시작·본인인증·사진/소개/지역 프로필·
> 매칭 큐·영상 공유·단체 채팅/귓속말·바로 매치 1회 결제·신고/차단·19+ 게이트)은
> §0 의 실제 화면으로 뒷받침됨. **확정되지 않은 기능(예: 영상통화 등)은 넣지 않았다.**

---

## 3. 프로모션 텍스트 (Promotional Text, 170자 이내) 초안

> 앱 업데이트 없이 교체 가능. 한국어 기준 170자 이내.

**안 1 (감성/컨셉):**
```
오늘 하루, 누군가의 일상으로. 짧은 영상과 대화로 자연스럽게 연결되는 만 19세 이상
소셜·매칭. 혼자도, 친구와도. 사진·자기소개·활동 지역으로 나를 표현하고 매칭 큐에서
새로운 인연을 만나보세요.
```
(공백 포함 글자수 확인 후 제출 — 초안은 170자 이내 목표)

**안 2 (기능 직설):**
```
프로필 매칭 + 일상 영상 공유 + 단체 채팅을 한 앱에서. 익명으로 가볍게 시작하고,
본인인증으로 안전하게. 혼자 또는 친구와 매칭 큐에 들어가 새로운 사람과 대화를
시작하세요.
```

> 제출 전 글자수(공백 포함 170자) 재확인 필요 — `[채워넣기: 최종 글자수 확인]`.

---

## 4. 키워드 (Keywords, 쉼표구분 100자 이내) 초안

> 공백 없이 쉼표로 구분하면 더 많이 들어감. 앱 이름/카테고리 중복 단어는 빼는 게 유리.

```
소셜,매칭,친구,대화,채팅,만남,동네친구,영상,일상공유,새로운친구,소개팅,랜덤,모임,인연
```

> 검증 메모: 100자(공백 포함) 이내인지 제출 직전 확인 `[채워넣기: 최종 글자수 확인]`.
> 경쟁/타사 상표어·과장어("최고", "1위" 등) 금지. 위 후보는 실제 기능(매칭·대화·영상
> 공유·친구) 기반이라 리젝 리스크 낮음.

---

## 5. 연령 등급 권고 — **17+** (Age Rating)

권고: **17+ (또는 App Store 신규 등급 체계에서 그에 상응하는 등급)**.

이유:
- **제한 없는 사용자 생성 콘텐츠(UGC)**: 프로필 사진, 짧은 영상, 자유 채팅(@멘션
  귓속말 포함)이 실시간으로 오간다. 사전 필터가 보장되지 않는 UGC 는 Apple 기준상
  높은 등급으로 분류된다.
- **낯선 사람 간 소통/만남 기능**: 매칭 큐로 모르는 사람과 연결되고 대화방에서
  교류한다 — 소셜/데이팅 성격.
- **본 서비스 자체가 만 19세 이상 전용**(약관·본인인증 연령 게이트). 따라서 앱이
  허용하는 연령 하한과의 정합성을 위해서도 최소 17+ 이상이 적절.
- App Store Connect 의 콘텐츠 설문에서 "Unrestricted Web Access" 는 해당 시 정확히
  표기 `[개발자 확인 필요: 외부 웹 임의 열람 가능 여부]`. PortOne 인증/결제는 특정
  도메인 웹뷰이므로 "무제한 웹 접근" 과는 다름 — 과대 표기하지 말 것.

> 주의: Apple 의 콘텐츠 설문(폭력/성적/약물 등)은 실제 콘텐츠에 맞게 정직하게.
> "데이팅/소셜 + UGC" 조합은 보수적으로 17+ 로 두는 것이 리젝/재심사 리스크를 줄인다.

---

## 6. 지원 URL / 마케팅 URL 권고

- **지원 URL (Support URL, 필수):** `https://dei-admin.vercel.app/legal` 재활용 가능.
  - 약관/개인정보처리방침이 이 도메인 하위에 호스팅돼 있다면 지원/문의 안내까지
    포함하도록 페이지를 보강하는 것이 이상적 `[개발자 확인 필요: /legal 에 문의
    연락처·지원 안내가 있는지]`. 없으면 최소한 문의 이메일을 노출.
- **마케팅 URL (Marketing URL, 선택):** 동일 도메인의 랜딩 또는
  `https://dei-admin.vercel.app/legal` 재활용 가능. 별도 랜딩이 없으면 비워도 무방.
- **개인정보 처리방침 URL (Privacy Policy URL, 필수):** `/legal` 내 개인정보
  처리방침 경로를 직접 지정 `[채워넣기: 정확한 privacy 경로]`
  (예: `https://dei-admin.vercel.app/legal/privacy` — 실제 경로 확인 필요).

---

## 7. 제출 전 사람 확인 체크리스트

- [ ] 본인인증 우회 방식 (a)/(b) 중 택1 결정 + 실제 구현/계정 생성 완료
      (현재 `EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS` 는 **코드 미연결 dead flag**)
- [ ] 데모 계정/전화번호/인증코드 `[채워넣기]` 확정 후 Notes 반영
- [ ] 부스터 결제 경로 확정 (PortOne 유지 vs Apple IAP) — IAP 면 샌드박스 계정 명시
- [ ] Description/프로모션/키워드 최종 글자수(공백 포함) 검수
- [ ] 연령 등급 콘텐츠 설문 정직 작성 (17+ 권고)
- [ ] 지원/마케팅/개인정보 URL 의 실제 경로 확인 (`/legal` 하위 정확한 경로)
- [ ] Description 의 모든 기능 주장이 심사 빌드에서 실제 동작하는지 확인

---

## 부록 A. placeholder 목록 (제출 전 전부 해소)

| placeholder | 위치 | 무엇을 채워야 하나 |
|---|---|---|
| `[개발자 확인 필요]` 본인인증 우회 방식 | §1-A, §1-B, §1-C, §7 | (a) 우회 빌드 구현 vs (b) 데모 계정 — 택1 + 실제 구현 |
| `[채워넣기]` 데모 자격증명/전화/인증코드 | §1-A, §1-B | 심사관이 쓸 계정·전화·코드 |
| `[개발자 확인 필요]` 결제(PortOne vs IAP) | §1-A, §1-B, §7 | IAP 전환 여부 |
| `[채워넣기]` IAP 샌드박스 계정 | §1-A, §1-B | IAP 면 샌드박스 테스터 |
| `[채워넣기]` 심사 담당자 연락처 | §1-A, §1-B | 이름/이메일/전화 |
| `[채워넣기]` 프로모션 최종 글자수 | §3 | 170자 이내 확인 |
| `[채워넣기]` 키워드 최종 글자수 | §4 | 100자 이내 확인 |
| `[개발자 확인 필요]` 무제한 웹 접근 여부 | §5 | 콘텐츠 설문 정확 표기 |
| `[개발자 확인 필요]` /legal 지원 정보 유무 | §6 | 지원 페이지 보강 필요 여부 |
| `[채워넣기]` privacy 정확 경로 | §6 | 개인정보 처리방침 URL |
```

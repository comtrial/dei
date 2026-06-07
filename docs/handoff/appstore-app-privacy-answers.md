# App Store Connect — App Privacy(개인정보 영양표) 설문 답안 가이드

> 대상: dei (iOS, bundleId `kr.cmdsoftware.dei`). App Store Connect → 해당 앱 →
> **App Privacy** 섹션을 채울 때 이 표를 그대로 따라 입력한다.
> 근거는 모두 코드/설정에서 확인된 사실이다(추측 항목은 `[확인 필요]`로 표시).
> 작성 기준일: 2026-06-07.

---

## 1. 요약 (먼저 읽을 것)

- **추적(Tracking) 안 함.** 광고 없음, 제3자 광고 네트워크/IDFA/ATT 연동 없음,
  데이터 판매 없음. → **ATT(App Tracking Transparency) 프롬프트 불필요**,
  App Privacy 의 모든 데이터 타입에서 **"Used to Track You = No"**.
- 수집하는 데이터는 대부분 **"사용자에 연결됨(Linked to the user)"** 이다.
  익명 로그인이라도 앱이 발급한 **익명 세션 user id** 를 기준으로 프로필·콘텐츠·
  분석 이벤트가 한 사람으로 묶이기 때문에 Apple 기준상 Linked 로 본다.
  (PostHog `identify(userId)`, Sentry `setUser({ id })` 로 실제 user id 와 연결됨 — 코드 확인.)
- 수집 목적은 크게 **App Functionality**(앱 기능),
  **Analytics**(분석), **Product Personalization**(매칭/큐레이션 개인화) 세 가지.
- 처음 진입은 ASC App Privacy → **Get Started**. 마지막에 **Publish** 눌러야
  실제 스토어에 반영된다(저장만으로는 미반영). 자세한 순서는 §5.

---

## 2. Apple 데이터 카테고리별 답안표

> 열 의미
> - **수집**: 이 카테고리를 "수집함(Yes)"으로 신고할지.
> - **세부 데이터 타입**: ASC 에서 체크할 하위 항목.
> - **목적**: App Functionality / Analytics / Product Personalization 등.
> - **Linked**: 사용자(=익명 user id 포함)에 연결되는지. dei 는 거의 전부 Yes.
> - **Tracking**: 제3자 추적에 사용 — dei 는 **전부 No**.
> - **근거**: 어느 기능/SDK 에서 발생하는지.

### 2-1. Yes (수집함)으로 신고할 카테고리

| Apple 카테고리 | 수집 | 세부 데이터 타입 | 목적 | Linked | Tracking | 근거 (기능/SDK) |
|---|---|---|---|---|---|---|
| **Contact Info** | **Yes** | Name, Phone Number | App Functionality | Yes | No | PortOne 휴대폰 본인확인(선택) 시 이름·전화번호 수신 (`@portone/react-native-sdk`). |
| **Financial Info** | **Yes** | Purchase History (구매 이력) | App Functionality | Yes | No | 부스터 구매(현재 PortOne 결제). 구매/거래 이력 보관. ※IAP 전환 후 처리주체 변경 → §4 `[확인 필요]`. |
| **Location** | **Yes** | Precise Location, Coarse Location | App Functionality | Yes | No | 온보딩에서 활동 지역 자동 입력(`expo-location`, `step3.tsx`). 동의 시에만, 추적용 아님. |
| **User Content** | **Yes** | Photos or Videos, Audio Data, Other User Content(닉네임·자기소개·채팅 메시지) | App Functionality, Product Personalization | Yes | No | 프로필 사진 촬영(`expo-image-picker`/`expo-camera`), 일상 공유 영상+마이크 오디오(`NSMicrophoneUsageDescription`), 닉네임/자기소개/채팅 메시지(Supabase). |
| **Identifiers** | **Yes** | User ID, Device ID | App Functionality, Analytics | Yes | No | 익명 세션 user id(Supabase auth), 디바이스 식별자(PostHog distinct id / Expo Push 토큰 식별 등). |
| **Purchases** | **Yes** | Purchase History | App Functionality | Yes | No | 부스터 구매 이력. (Apple 표에서 Purchases 와 Financial Info 의 Purchase History 가 겹침 → 둘 다 해당되면 양쪽 체크.) |
| **Usage Data** | **Yes** | Product Interaction | Analytics, Product Personalization | Yes | No | PostHog 제품 분석 이벤트(`lib/posthog.ts`) — 화면 진입/탭/매칭·채팅 상호작용. |
| **Diagnostics** | **Yes** | Crash Data, Performance Data, Other Diagnostic Data | Analytics(App Functionality 성격) | Yes | No | Sentry 크래시·에러·성능 로그(`@sentry/react-native`), `setUser({ id })` 로 user 연결. |

#### Sensitive Info / "민감정보" 취급 주의 (본인확인 데이터)

| Apple 카테고리 | 수집 | 세부 데이터 타입 | 목적 | Linked | Tracking | 근거 |
|---|---|---|---|---|---|---|
| **Sensitive Info** | **`[확인 필요]`** | (생년월일·성별·CI/DI 등 본인확인 정보) | App Functionality | Yes | No | PortOne 휴대폰 본인확인(선택) 시 이름·생년월일·성별·CI/DI·전화번호 수신. CI/DI·생년월일·성별이 Apple 의 "Sensitive Info" 로 분류될지 법무 확인 필요 — §4 참조. **확정 전 임의 체크/해제 금지.** |

> 참고: 이름·전화번호는 위 **Contact Info** 에 이미 신고. 생년월일·성별·CI/DI 의
> 분류만 `[확인 필요]`. Apple 의 "Sensitive Info" 정의에 한국 본인확인 식별자(CI/DI)가
> 들어가는지 단정 불가하므로 코드만으로 확정하지 않는다.

### 2-2. No (수집 안 함)으로 신고할 카테고리

| Apple 카테고리 | 수집 | 비고(왜 No) |
|---|---|---|
| **Health & Fitness** | **No** | 건강/피트니스 데이터 수집 코드 없음. |
| **Contacts** | **No** | 주소록/연락처 접근 없음. iOS 권한 요청도 없음(`app.json` infoPlist 에 연락처 권한 없음). |
| **Browsing History** | **No** | 웹 브라우징 이력 수집 없음. |
| **Search History** | **No** | 앱 내 검색 이력을 별도 데이터 타입으로 수집/저장하지 않음. |
| **Sensitive Info** | **`[확인 필요]`** | 위 §2-1 주의 항목 참조(본인확인 정보 분류 미확정). 그 외 인종/종교/성적지향 등 별도 수집 없음. |
| **Other Data** | **No** | 위에 매핑되지 않는 추가 수집 데이터 타입 없음. 푸시 토큰(Expo Push)은 Identifiers/Device 식별로 신고 범위에 포함. |

> 위 표에 **없는** 데이터 타입은 모두 "수집 안 함(No)". 목록에 없는 항목을
> 추측으로 추가하지 말 것.

---

## 3. SDK별 데이터 처리 주체 메모

App Privacy 는 **제3자 SDK 가 수집하는 데이터도 신고 대상**이다. dei 가 사용하는
주요 SDK 가 무엇을 받는지:

- **PostHog** (`posthog-react-native`): 제품 분석 이벤트(화면/탭/상호작용)와
  user id(`identify`)·디바이스 distinct id. → **Usage Data / Identifiers** 근거.
- **Sentry** (`@sentry/react-native`): 크래시·에러·성능 로그와 user id(`setUser`).
  → **Diagnostics / Identifiers** 근거.
- **Supabase** (`@supabase/supabase-js`): 백엔드. 익명 인증 세션, 프로필(닉네임·
  자기소개·사진/영상), 채팅 메시지, 구매 이력 등 저장. → **User Content / Identifiers /
  Financial Info** 근거(자사 백엔드, 제3자 추적 아님).
- **Expo Push** (`expo-notifications`): 푸시 전송용 디바이스 토큰 발급/보관.
  → **Identifiers(Device)** 근거.
- **PortOne** (`@portone/react-native-sdk`, `@portone/browser-sdk`): 휴대폰
  본인확인 시 이름·생년월일·성별·CI/DI·전화번호 수신, 부스터 결제 처리.
  → **Contact Info / Financial Info / (Sensitive Info `[확인 필요]`)** 근거.

> 광고 SDK·attribution SDK·제3자 추적 SDK 는 사용하지 않음 → Tracking 전부 No 의 근거.

---

## 4. 주의·확인 필요 항목 (`[확인 필요]`)

코드만으로 법적·정책적으로 단정할 수 없는 항목. 입력 전 사람/법무 확인.

1. **`[확인 필요]` 본인확인 CI/DI·생년월일·성별의 "Sensitive Info" 분류** —
   Apple "Sensitive Info" 정의에 한국 본인확인 식별자(CI/DI)·생년월일·성별이
   포함되는지 법무 확인 후 §2-1 의 Sensitive Info 행을 Yes/No 확정. 이름·전화번호는
   Contact Info 로 이미 신고됨.
2. **`[확인 필요]` IAP 전환 후 Financial Info / Purchases 처리주체** —
   현재 부스터 결제는 PortOne. 향후 Apple IAP(StoreKit) 전환 시 구매 처리주체가
   **Apple** 로 바뀌고, 앱이 직접 보관하는 결제정보 범위/신고 내용이 달라질 수 있음.
   전환 시 이 표 재검토(코드상 IAP 라이브러리 미도입 확인 — `react-native-iap`/
   `expo-in-app-purchases` 없음, 현재는 PortOne 기준).
3. **`[확인 필요]` 익명 user id 의 Linked 판정** — 본 가이드는 익명이라도 user id 로
   한 사람에 묶이므로 보수적으로 **Linked = Yes** 로 신고. Apple 심사/정책 해석에서
   "비식별 유지" 주장 가능 여부는 별도 확인(불확실 시 Linked 유지가 안전).
4. **`[확인 필요]` Coarse vs Precise Location 범위** — `expo-location` 정밀/대략
   둘 다 가능. 실제 요청 정확도(`Accuracy`)에 따라 Precise 만/둘 다 체크할지 확정.
   현재 표는 보수적으로 둘 다 표기.

> 위 항목들은 확정 전 임의로 체크/해제하지 말 것. 코드로 확정 불가한 부분이다.

---

## 5. ASC 입력 순서 팁

1. **App Store Connect** → 해당 앱 선택 → 왼쪽 메뉴 **App Privacy**.
2. Data Collection 섹션 **Get Started** 클릭. 첫 질문
   "Do you or your third-party partners collect data from this app?" → **Yes**
   (PostHog/Sentry/Supabase/PortOne/Expo Push 가 수집하므로).
3. **카테고리 체크**: §2-1 의 Yes 카테고리(Contact Info, Financial Info, Location,
   User Content, Identifiers, Purchases, Usage Data, Diagnostics)를 선택.
   §2-2 의 No 카테고리는 체크하지 않음. Sensitive Info 는 §4-1 확인 후 결정.
4. 각 데이터 타입마다 다음을 답한다:
   - **세부 데이터 타입** 체크 (표의 "세부 데이터 타입" 열).
   - **사용 목적(Purpose)**: 표의 "목적" 열 (App Functionality / Analytics /
     Product Personalization). 한 타입에 복수 목적 가능.
   - **Linked to the User?**: 표대로 거의 전부 **Yes**.
   - **Used to Track You?**: **전부 No** (dei 는 추적 안 함).
5. 모든 카테고리 입력 후 **Save** → 최종 **Publish** 클릭(Publish 해야 스토어 반영).
6. 신규 빌드 제출 전 본 가이드와 실제 코드(특히 IAP 전환·신규 SDK 추가 시)를
   재대조한 뒤 Publish.

---

### 부록: 한눈에 보는 Yes/No

- **Yes(수집)**: Contact Info · Financial Info · Location · User Content ·
  Identifiers · Purchases · Usage Data · Diagnostics
- **No(미수집)**: Health & Fitness · Contacts · Browsing History · Search History · Other Data
- **`[확인 필요]`**: Sensitive Info(본인확인 CI/DI·생년월일·성별 분류)
- **Tracking**: 전 카테고리 **No** (ATT 프롬프트 불필요)

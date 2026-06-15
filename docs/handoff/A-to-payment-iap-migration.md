# A→결제담당 핸드오프 — 부스터(바로 매치) 결제 PortOne → Apple IAP(RevenueCat) 전환

> Obsolete: 이 문서는 RevenueCat 검토 당시의 과거 핸드오프입니다. 현재 구현 기준은
> `docs/handoff/payment-iap-implementation-checklist.md` 의 Apple IAP 직접 검증
> 흐름을 따릅니다.

> 작성: A(출시 준비). 대상: 결제 담당자. 상태: **인계 대기 — 결제 담당이 IAP 전환 착수.**
> 근거: 현재 브랜치 실제 코드 라인 인용(아래 전부 파일:라인 명시).
> 우선순위: **HIGH — App Store 제출 blocker.** PortOne 그대로 제출 = Guideline 3.1.1 확정 리젝.

---

## 1. 무엇이 문제인가 (사실, 코드 근거)

부스터("바로 매치", 24h 재매칭 제한을 면제하고 즉시 큐 진입시켜 주는 **앱 내 디지털 재화**) 결제가
현재 **PortOne(외부 PG: VISA·KB Pay)** 풀스택으로 구현돼 있다. Apple App Store **Guideline 3.1.1** 상
앱 내 디지털 재화는 **Apple In-App Purchase(IAP) 필수**라, PortOne 으로 제출하면 리젝이다.

현재 PortOne 이 어떻게 엮여 있는지 — **풀스택 4겹(화면 1 + 클라 lib 1 + Edge Function 2)**:

### (1) 화면 — `apps/mobile/app/(app)/booster.tsx`
- L1: `import { Payment } from '@portone/react-native-sdk';` — PortOne 웹뷰 결제 컴포넌트.
- L2: `import type { PaymentRequest, PaymentResponse } from '@portone/browser-sdk/v2';`
- L28~31: `confirmInstantRematchPayment` / `startInstantRematchPayment` import.
- L115~133 `handlePay()`: `startInstantRematchPayment(selectedPack.id)` 호출 → 받은 `PaymentRequest` 를 state(`paymentRequest`)에 넣음.
- L223~253: `paymentRequest` 가 있으면 화면 전체를 `<Payment request={…} onComplete={…} onError={…} />`(L236~240) 으로 전환 — PortOne 웹뷰가 뜸.
- L141~207 `handlePaymentComplete(response)`: PortOne 결제 완료 콜백 → L159 `confirmInstantRematchPayment(response, …)` 로 서버 검증 → 성공 시 후속 흐름(§4).
- L318~330: "PortOne · VISA · KB Pay" 배지 + "1회 결제 · 정기결제 아님 / 미사용 시 7일 내 환불" 문구 — **IAP 전환 시 카피도 교체 필요**(Apple 은 자체 환불 정책, "7일 내 환불" 문구 부적절).

### (2) 클라 lib — `apps/mobile/lib/portone.stub.ts`
- L267~282 `startInstantRematchPayment(productId)`: `supabase.functions.invoke('start-instant-rematch-payment', { body: { productId } })` → `{ request: PaymentRequest }` 반환.
- L284~311 `confirmInstantRematchPayment(response, productId)`: `supabase.functions.invoke('confirm-instant-rematch-payment', { body: { code, message, paymentId, productId, txId } })` → `{ granted, ok, paymentId }` 반환.
- ⚠️ 이 파일은 **본인인증(identity)** 로직과 한 파일에 섞여 있다(L115~265). IAP 전환은 **결제 2함수만** 떼어 새 모듈로 옮기고 본인인증 PortOne 은 건드리지 마라(§6).

### (3) 상품 정의 — `apps/mobile/lib/b-flow.ts`
- L84~109 `PAYMENT_PACKS`: 3개 상품. id 가 `POLICY.payment.instantRematchProductId`(=`'booster_instant_rematch_v1'`) 기반.
  - L87 `id: POLICY.payment.instantRematchProductId` (1회)
  - L95 `id: …_pack3` (3회 팩, "12% 할인")
  - L102 `id: …_pack10` (10회 팩, "29% 할인")
- L78~82: 가격 라벨은 **표시용 텍스트**(`EXPO_PUBLIC_INSTANT_REMATCH_PRICE_*_LABEL`, 기본 "스토어 가격"). 실제 금액은 서버 env(아래).
- 실제 금액/지급량 SSOT = `supabase/functions/_shared/instant-rematch-payment.ts` L14~33 `INSTANT_REMATCH_PRODUCT_CONFIGS`: 각 상품의 `granted`(지급 횟수)와 `amountEnv`(`PORTONE_INSTANT_REMATCH_AMOUNT_1/3/10`).

### (4) Edge Function 2개 (PortOne 검증 풀스택)
- `supabase/functions/start-instant-rematch-payment/index.ts`
  - L30~31: `PORTONE_STORE_ID` / `PORTONE_PAYMENT_CHANNEL_KEY` env 로드.
  - L34~41: `payment` 테이블에 `status:'pending'`, `provider:'portone'` 행 insert.
  - L47~72: PortOne `PaymentRequest`(storeId·channelKey·payMethod CARD·KRW 등) 조립해 클라에 반환.
- `supabase/functions/confirm-instant-rematch-payment/index.ts`
  - L87~88: `PORTONE_STORE_ID` / `PORTONE_API_SECRET` 로드.
  - L89~97: `https://api.portone.io/payments/{paymentId}` 로 **서버-사이드 결제 조회**(`Authorization: PortOne {apiSecret}`).
  - L119~147: 결제 완료(`isPaid`) + 금액 일치 검증. 불일치 시 `payment.status='failed'` + reconciliation 로그.
  - L149~158: 검증 통과 시 `payment.status='completed'`.
  - L164~203: **`pass` 테이블 적립** — `kind:'booster'`, `status:'active'` 행에 `product.granted` 만큼 `remaining`/`granted` 증가(없으면 insert). ← **이 적립 로직이 비즈니스 핵심. 유지 대상(§3 서버).**

> 한 줄: **결제 검증 소스가 PortOne(KRW 카드/계좌)** 라는 점만 Apple IAP 위반이다. 큐 진입·pass 적립 등 그 위/아래 비즈니스 로직은 PG 와 무관하게 그대로 살린다.

---

## 2. 자산 상태 — RevenueCat 은 깔려만 있고 코드 연결 0

- `apps/mobile/package.json` L76: `"react-native-purchases": "^10.1.0"` — **이미 설치됨.**
- 그러나 `apps/mobile` 전체에서 `Purchases.configure` / `getOfferings` / `purchasePackage` **사용처 0건**(grep 확인). 즉 SDK 가 의존성에만 있고 **초기화·호출이 전혀 없다.**
- `apps/mobile/.env.example` L37~42 에 키 placeholder 존재:
  - L37 `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=`
  - L38 `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=`
  - L39 `EXPO_PUBLIC_REVENUECAT_REFRESH_OFFERING_ID=refresh`
  - L40 `EXPO_PUBLIC_REVENUECAT_REFRESH_PRODUCT_ID=dei_refresh_1`
  - L41 `EXPO_PUBLIC_REVENUECAT_HEART_OFFERING_ID=heart`
  - L42 `EXPO_PUBLIC_REVENUECAT_HEART_PRODUCT_ID=dei_heart_1`
  - ⚠️ **주의:** 이 offering/product id(`refresh`/`heart`)는 부스터 상품과 **다른 네이밍**이다. 부스터는 `booster_instant_rematch_v1` (+`_pack3`/`_pack10`) 3종. 새 offering/product id 를 부스터용으로 추가 정의할지, 위 placeholder 를 부스터로 재정의할지 결정 필요. **App Store Connect 상품 식별자와의 매핑 표를 먼저 합의하라**(§3 인프라).

---

## 3. 전환 범위 (체크리스트)

### 클라 (`booster.tsx` + 새 `lib/purchases.ts`)
- [ ] `booster.tsx` L1~2 PortOne import 제거. L223~253 의 `<Payment>` 웹뷰 분기 → RevenueCat 결제 호출로 교체(웹뷰 화면 자체가 사라지고, 버튼 탭 → 네이티브 결제 시트).
- [ ] `lib/portone.stub.ts` 의 `startInstantRematchPayment`/`confirmInstantRematchPayment`(L267~311) 대신 새 `lib/purchases.ts` 에:
  - `Purchases.getOfferings()` 로 부스터 offering·package 조회.
  - 선택 상품(`selectedPack.id`)을 App Store Connect product id 로 매핑 → `Purchases.purchasePackage(pkg)` 호출.
  - 구매 결과(customerInfo / transaction)를 서버 검증 Edge 로 전달(§서버).
- [ ] `b-flow.ts` `PAYMENT_PACKS`(L84~109)의 id 3종을 **App Store Connect 소비성(consumable) 상품 식별자와 매핑**. 가격 라벨(L78~82)은 RevenueCat 이 주는 `localizedPriceString` 으로 대체(스토어가 가격 SSOT — Apple 정책상 앱이 가격 하드코딩 금지).
- [ ] **결제 SDK 초기화 추가** — `apps/mobile/app/_layout.tsx` L30~33 `useEffect` 안에서 `initSentry()`/`initPostHog()` 가 1회 초기화되는 패턴 그대로, `initPurchases()`(내부에서 `Purchases.configure({ apiKey: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY })`) 를 같은 위치에 추가. `lib/sentry.ts`·`lib/posthog.ts` 와 동일하게 `lib/purchases.ts` 에 init 함수를 둬라(컨벤션 일치). 로그인 후 `Purchases.logIn(user.id)` 로 RevenueCat appUserID 를 Supabase user.id 에 맞추는 것 권장(서버 webhook 매칭에 필요).
- [ ] 카피 교체: `booster.tsx` L318~330 "PortOne · VISA · KB Pay" 배지 및 "7일 내 환불" 문구 → Apple IAP 에 맞는 표현으로(Apple 환불은 Apple 정책).

### 서버 (Edge Function 2개)
- [ ] `start-instant-rematch-payment`(PortOne `PaymentRequest` 조립) — IAP 는 클라가 스토어와 직접 거래하므로 **"결제 시작 request 조립"이 불필요**해질 수 있다. `payment` 행 pending insert 만 남길지, 함수를 폐기할지 결정.
- [ ] `confirm-instant-rematch-payment` L87~117 의 **PortOne 결제 조회(`api.portone.io`)를 StoreKit 영수증/거래 검증으로 교체**:
  - **App Store Server API**(JWS 트랜잭션 검증) 또는 **RevenueCat webhook**(서버가 RevenueCat 으로부터 검증된 구매 알림 수신) 중 택1.
  - **검증 소스만 교체하고 L164~203 `pass` 적립 로직은 그대로 유지**(kind='booster' 적립). 이게 §6 "건드리면 안 되는 것".
  - L122 금액 일치 검증(`amount !== product.amount`)은 IAP 에선 product id 매칭으로 대체.
- [ ] `provider:'portone'`(L39, L155, confirm L155) 등 `payment` 테이블의 provider 값을 `'apple_iap'` 등으로 구분.

### 인프라 (사람이 콘솔에서)
- [ ] **App Store Connect**: 부스터 3상품을 **소비성(Consumable)** IAP 으로 등록(1회/3회/10회). product id 확정 → `PAYMENT_PACKS` 매핑 표 작성.
- [ ] **RevenueCat 대시보드**: 앱 등록 + 위 IAP 상품 연결 + offering/package 구성 + (필요 시) entitlement. webhook 검증 경로면 webhook → Supabase Edge 연결.
- [ ] **EAS env**: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` 를 EAS 환경에 주입. ⚠️ `EXPO_PUBLIC_*` 는 **빌드타임 임베드** — env 만 바꾸고 재빌드 안 하면 실행 중 앱은 옛 키를 본다(메모리 기준: PostHog 키가 빌드에 안 박혀 SDK 가 죽은 전례 있음). **주입 후 반드시 재빌드.**
- [ ] (서버) App Store Server API 키 / RevenueCat webhook secret 을 **Supabase Edge secrets** 로 주입(`supabase secrets set`). 기존 `PORTONE_*` secret 은 본인인증이 여전히 쓰므로 **제거하지 마라**(§6).

---

## 4. 유지해야 할 계약 — 결제 성공 후 후속 흐름 (그대로)

`booster.tsx` L155~207 `handlePaymentComplete` 의 **결제 검증 성공 이후** 로직은 PG 와 무관하다. 새 IAP 구매가
성공·서버검증 통과한 직후 **동일 순서로 이어가야** 한다:

1. L168~176: `getAppNotificationEnabled(user.id)` — 앱 알림 미설정이면 `/(app)/permission/notification` 로(`memberIds` 파라미터 전달).
2. L178~186: `requestPermission('notification')` — OS 권한 미허용이면 동일 권한 화면으로.
3. L188~192: `registerPushToken(user.id)` — push token 등록.
4. L193: `enqueueMatchQueue(queueMemberIds)` — **매칭 큐 진입**(부스터의 실제 목적).
5. L195: `router.replace(ROUTES.queue)` — 큐 화면 이동.
6. 실패 경로(L199~205): `booster-failed` 로 replace. IAP 도 구매 취소/검증 실패 시 동일하게 실패 화면으로.

> 즉 IAP 전환은 **L141~162 "PortOne 응답 → confirm" 구간만 교체**하고, **L164~207 후속 흐름은 손대지 마라.**

### 진입점 (회귀 확인 대상) — `ROUTES.booster`
부스터 화면으로 들어오는 경로(전부 그대로 유지):
- `home.tsx` L187 / L238 / L256 — 홈에서 진입.
- `my-profile.tsx` L580 — 프로필에서 진입.
- `permission/notification.tsx` L77 / L102 / L142 — 알림 권한 화면에서 부스터 복귀.
- `booster-failed.tsx` L129 — 결제 실패 후 재시도.

---

## 5. 검증 요구 (CLAUDE.md 규칙 인용 — "작업 완료" ≠ "검증 완료")

CLAUDE.md Testing §7·8·9 가 결제/Edge/auth 변경에 그대로 적용된다. **IAP 는 mock 으로 절대 못 잡는다**:

- **샌드박스 Apple 계정으로 실제 StoreKit 구매 e2e 필수.** unit/component/e2e-web 은 전부 mock 이라
  "통과해도 실제 결제 동작 보장 안 됨"(§7). 실제 앱이 겪는 것 — ① Edge Function **배포 상태**(미배포면 앱이 닿지도 못함),
  ② `EXPO_PUBLIC_*` **빌드타임 임베드 시점**, ③ **검증 토큰/영수증 형식 호환** — 은 mock·RPC직접 어디서도 안 잡힌다(§9).
- **배포 산출물 체크리스트**(§8): 마이그레이션 적용 ✅ / `supabase functions deploy confirm-instant-rematch-payment`(및 start) ✅ /
  `supabase functions list` 에 변경 함수 존재 ✅ / Edge secrets(App Store Server API 키 또는 RevenueCat webhook secret) 존재 ✅ /
  EAS env `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` 재빌드 반영 ✅. **하나라도 비면 "기능 완료" 아님.**
  - 실제로 채팅에서 마이그레이션만 적용하고 Edge Function 을 안 올려 앱이 죽은 전례가 있다(§8). **DB 반영 ≠ Edge 배포.**
- **앱과 동일 경로로 e2e**(§9): 전용 테스트 유저의 실제 발급 토큰으로 → 원격 배포된 confirm Edge 를 →
  앱과 동일한 `functions.invoke` 경로로 호출 → `payment` 행 completed + `pass.remaining` 증가까지 확인.
  service_role 우회/RPC 직접 호출로 대체하면 위 ①②③ 전부 못 잡는다.
- 게이트는 `pnpm verify`(머지 게이트). 결제 로깅은 `@dei/shared` `logger` 경유(이미 booster.tsx L116·L127 등 적용됨) — 새 IAP 경로에도 `logger.withErrorCapture`/`captureException` 유지.

---

## 6. 건드리면 안 되는 것

- **매칭 큐 로직**: `enqueueMatchQueue`(booster.tsx L193) 및 큐 진입 흐름. 결제 성공 신호만 바뀌고 큐는 그대로.
- **pass 적립 비즈니스 로직**: `confirm-instant-rematch-payment` L164~203(`kind='booster'` pass remaining/granted 증가). **검증 소스만 교체, 적립 규칙·`product.granted` 수치는 유지.**
- **알림 흐름**: booster.tsx L168~192(알림 권한 → push token 등록). 그대로.
- **본인인증(identity) PortOne**: `lib/portone.stub.ts` L115~265 의 `startIdentityVerification`/`confirmIdentityVerification` 등은 **결제와 별개 도메인**이고 본인인증은 IAP 대상이 아니다(디지털 재화 아님). 결제 2함수만 떼어내고 본인인증 PortOne·`PORTONE_*` 본인인증 secret 은 **절대 제거 금지.** (이 파일이 결제+인증 혼재라 가장 위험한 지점.)

---

## 7. Android 메모

이번은 **iOS 우선**이지만, Android 출시 시 Google Play Billing 이 동일하게 필수다. **RevenueCat 이 iOS(StoreKit)·Android(Play Billing) 양쪽을 추상화**하므로, `.env.example` L38 `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` 와 Play Console 상품만 추가하면 같은 `Purchases.purchasePackage` 코드로 양쪽 처리 가능 — iOS 작업 시 Android 도 함께 설계해 두면 재작업이 없다.

---

## 8. 착수 순서 권고 (결제 담당)

1. **인프라 먼저**(코드 막혀도 사람이 병렬 진행): App Store Connect 소비성 상품 3종 등록 → product id 확정 → `PAYMENT_PACKS` 매핑 표.
2. RevenueCat 대시보드 앱·상품·offering 연결, iOS API key 발급 → EAS env 주입 후 **재빌드**.
3. 클라: `lib/purchases.ts` + `_layout.tsx` init → `booster.tsx` 결제 호출 교체(후속 흐름 L164~207 무수정).
4. 서버: `confirm-instant-rematch-payment` 검증 소스 교체(영수증/webhook), `pass` 적립 유지 → `functions deploy`.
5. **샌드박스 실구매 e2e**(§5) 로 ①②③ 포함 관통 검증 후 보고. "통과" 아니라 "앱 동일 경로로 검증함"으로 보고.

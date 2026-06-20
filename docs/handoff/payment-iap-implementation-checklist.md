# 부스터 Apple IAP 직접 구현 체크리스트

## 코드 상태

- 부스터 결제 화면은 PortOne 결제 웹뷰나 RevenueCat SDK가 아니라 Apple iOS IAP 직접 결제 흐름을 사용한다.
- PortOne 본인인증은 결제와 별개이므로 유지한다. `PORTONE_*` 본인인증 secret 을 제거하지 않는다.
- 앱은 `expo-iap`로 App Store 소비성 상품 3종을 조회하고, 구매 성공 후 `confirm-instant-rematch-payment` Edge Function 을 호출한다.
- 구매 확인 Edge Function 은 App Store Server API 로 transaction 을 조회하고, Apple `signedTransactionInfo` payload 를 검사한 뒤 기존 `grant_instant_rematch_purchase` RPC 로 `payment` 기록과 `pass` 적립을 한 번에 처리한다.
- `payment.provider = apple_iap`, `payment.provider_transaction_id = Apple transactionId` 로 저장한다.
- `payment_provider_transaction_uniq` unique index 로 같은 Apple transaction 이 중복 적립되지 않게 한다.
- Expo Go 에서는 동작하지 않는다. iOS development build 또는 EAS production build 에서만 검증한다.

## 라이브러리 선택

- 선택: `expo-iap`
- 이유: 현재 앱은 Expo SDK 54 / RN 0.81 기반이고, Expo 문서의 직접 IAP 경로가 `expo-iap`를 기준으로 안내된다. `react-native-iap`는 Nitro module 등 추가 네이티브 의존이 더 커서 Expo dev client/EAS 흐름에서는 `expo-iap`가 우선이다.
- 전제: Expo Go 미지원. `expo-iap` config plugin 이 반영된 iOS native build 에서만 실제 StoreKit 결제 시트를 확인할 수 있다.

## 사람이 콘솔에서 해야 하는 작업

1. App Store Connect 에 부스터 소비성 IAP 3종을 등록한다.
   - 1회: `booster_instant_rematch_v1`
   - 3회: `booster_instant_rematch_v1_pack3`
   - 10회: `booster_instant_rematch_v1_pack10`
   - 실제 product id 를 다르게 쓰면 EAS env 와 Supabase secrets 의 product id 도 동일하게 바꾼다.
2. App Store Connect 에서 App Store Server API 키를 준비한다.
   - Issuer ID
   - Key ID
   - `.p8` private key
3. EAS env 에 public product id override 가 필요한 경우에만 주입하고 앱을 재빌드한다.
   - `EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_1`
   - `EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_3`
   - `EXPO_PUBLIC_APP_STORE_BOOSTER_PRODUCT_ID_10`
   - 기본 product id 를 그대로 쓰면 위 값들은 생략 가능하다.
4. Supabase Edge secrets 를 설정한다.
   - `APP_STORE_ENVIRONMENT` (`sandbox` 또는 `production`)
   - `APP_STORE_BUNDLE_ID` (`kr.cmdsoftware.dei`)
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_KEY_ID`
   - `APP_STORE_CONNECT_PRIVATE_KEY`
   - `APP_STORE_INSTANT_REMATCH_PRODUCT_ID_1` (override 필요 시)
   - `APP_STORE_INSTANT_REMATCH_PRODUCT_ID_3` (override 필요 시)
   - `APP_STORE_INSTANT_REMATCH_PRODUCT_ID_10` (override 필요 시)
5. DB migration 을 적용하고 Edge Function 을 배포한다.
   - `supabase db push`
   - `supabase functions deploy confirm-instant-rematch-payment`
   - `supabase functions deploy start-instant-rematch-payment`
6. Apple sandbox 계정으로 실구매 e2e 를 수행한다.
   - 앱의 Apple IAP 구매 시트 표시
   - 구매 성공 후 `confirm-instant-rematch-payment` 원격 Edge 호출
   - `payment.status = completed`
   - `payment.provider = apple_iap`
   - `payment.provider_transaction_id` 저장
   - `pass.remaining` 증가
   - 동일 transaction 재전송 시 `duplicate = true`, 추가 적립 없음
   - 알림 권한 확인 후 매칭 큐 진입

## 완료 기준 구분

- 작업 완료: 코드 구현, migration, env placeholder, 테스트가 준비된 상태.
- 검증 완료: App Store Connect/EAS/Supabase 설정 후 sandbox 실구매가 앱과 동일 경로로 통과한 상태.

mock/unit/component 테스트 통과만으로는 Apple IAP, 빌드타임 env 임베드, Edge Function 배포 상태를 검증했다고 보고하지 않는다.

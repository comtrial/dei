# 부스터 Apple IAP / RevenueCat 전환 체크리스트

## 코드 상태

- 부스터 결제 화면은 PortOne 결제 웹뷰 대신 RevenueCat `purchasePackage` 플로우를 사용한다.
- PortOne 본인인증은 유지한다. `PORTONE_*` 본인인증 secret 을 제거하지 않는다.
- 구매 확인 Edge Function 은 RevenueCat REST API 로 구매 내역을 확인한 뒤 `grant_instant_rematch_purchase` RPC 로 `payment` 기록과 `pass` 적립을 한 번에 처리한다.
- `payment.provider_transaction_id` unique index 로 같은 RevenueCat transaction 이 중복 적립되지 않게 한다.

## 사람이 콘솔에서 해야 하는 작업

1. App Store Connect 에 부스터 소비성 IAP 3종을 등록한다.
   - 1회: `booster_instant_rematch_v1`
   - 3회: `booster_instant_rematch_v1_pack3`
   - 10회: `booster_instant_rematch_v1_pack10`
   - 실제 product id 를 다르게 쓰면 아래 EAS env 와 Supabase secrets 의 product id 도 동일하게 바꾼다.
2. RevenueCat Dashboard 에 iOS 앱을 등록하고 App Store Connect IAP 3종을 연결한다.
3. RevenueCat offering/package 를 구성한다.
   - offering id: `booster`
   - package id: `booster_1`, `booster_pack3`, `booster_pack10`
4. EAS env 에 public SDK key 와 부스터 mapping 을 주입하고 앱을 재빌드한다.
   - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_OFFERING_ID`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_1`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_3`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PACKAGE_ID_10`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_1`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_3`
   - `EXPO_PUBLIC_REVENUECAT_BOOSTER_PRODUCT_ID_10`
5. Supabase Edge secrets 를 설정한다.
   - `REVENUECAT_REST_API_KEY`
   - `REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_1`
   - `REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_3`
   - `REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_10`
6. DB migration 을 적용하고 Edge Function 을 배포한다.
   - `supabase db push`
   - `supabase functions deploy confirm-instant-rematch-payment`
   - `supabase functions deploy start-instant-rematch-payment`
7. Apple sandbox 계정으로 실구매 e2e 를 수행한다.
   - 앱의 RevenueCat 구매 시트 표시
   - 구매 성공 후 `confirm-instant-rematch-payment` 원격 Edge 호출
   - `payment.status = completed`
   - `payment.provider = revenuecat`
   - `payment.provider_transaction_id` 저장
   - `pass.remaining` 증가
   - 알림 권한 확인 후 매칭 큐 진입

## 완료 기준 구분

- 작업 완료: 코드 구현, migration, env placeholder, 테스트가 준비된 상태.
- 검증 완료: App Store Connect/RevenueCat/EAS/Supabase 설정 후 sandbox 실구매가 앱과 동일 경로로 통과한 상태.

mock/unit/component 테스트 통과만으로는 Apple IAP, 빌드타임 env 임베드, Edge Function 배포 상태를 검증했다고 보고하지 않는다.

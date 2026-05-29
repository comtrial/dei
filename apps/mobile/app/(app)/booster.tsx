import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S17 — 바로 매치 결제
 * ==================================================================
 * 담당자: B
 * 화면 목적: 방 이탈 후 24h 재매칭 제한 중인 남성이 S05 매칭 CTA 탭 시 진입하는
 *           PRD §13 BM의 유일한 결제 화면. 24h 패널티를 면제하고 즉시 새 매칭 큐로
 *           진입(면제권/패스 구매). 결제 성공 → S07, 실패 → S18. 여성은 미진입
 *           (자동 무료 면제). 정식 명칭 '바로 매치 결제', 아이템 이름 '바로 매치'.
 * 의존 DS 컴포넌트: Text · IconButton(뒤로가기) · TopNav(타이틀 '바로 매치')
 *   · Badge(잔여 패스 '잔여 N회', 조건부) · CompareCard(그냥 기다리기 vs 바로 매치)
 *   · ChoiceList/Radio(가격 옵션 3개 1회/3회/10회 sel 토글) · Chip(DiscountBadge 할인율)
 *   · Card(TrustSignalBlock: PG 로고 + 환불 안내) · BottomActionBar(동적 가격 CTA)
 *   · Button(CTA 'N원 · 바로 매치 시작') · ProgressBar/Spinner(결제 진행 중, 조건부)
 *   · AlertDialog(가격 fetch 실패)  [@dei/ui]
 * 의존 데이터: 가격 옵션(상품) 1회/3회/10회 팩·할인율·개당가 / 잔여 패스 잔량 /
 *   24h 재매칭 제한 상태·카운트다운 / 결제 트랜잭션·면제권 소진·부여
 *   (스키마 후보: products, passes/entitlements, payment_transactions, match_queue)
 * 발생 이벤트(PostHog): bareo_match_payment_entered (결제 진입)
 * 서버 의존(L1): 결제 PG 연동 PortOne(콜백 표준 처리·복귀 시 상태 복구) /
 *   가격 옵션 제공 + 면제권 구매/소진/잔여 조회 RPC·Edge / 결제 성공 시 24h 면제 +
 *   매칭 큐(S07) 진입 처리
 * 정책 의존(L2): 가격표(1회 4,900 / 3회 12,900 / 10회 34,900)·할인율 /
 *   24h 재매칭 제한 시간 / 성별 무료 면제(여성 전원 무료, 남성 결제) /
 *   환불 정책(미사용 7일 내) / PRD §11-8 부스터 알림 빈도(남성 한정)
 * 와이어프레임 참조: all-screens S17
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(가치 비교 카드·가격 옵션·신뢰 시그널·PG 결제 동작)은 owner 가 채운다.
 */
export default function BareoMatchPaymentScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">바로 매치 결제</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S17
        </Text>
      </View>
    </SafeAreaView>
  );
}

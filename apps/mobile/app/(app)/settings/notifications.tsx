import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S22 — 알림 설정
 * ==================================================================
 * 담당자: B
 * 화면 목적: S19 '알림' row → 진입. 마스터 토글 1개로 단순. 항목별 분리·수면시간
 *           설정 모두 MVP 제외. 새벽 발송은 서버단에서 자동 차단.
 * 의존 DS 컴포넌트: TopNav(뒤로가기 + 타이틀 '알림') · SettingsRow(마스터 토글 row
 *   '알림 받기') · Toggle(44x26 알약 토글, accent ON / ink-4 OFF) · Text(설명 sub
 *   'OFF 시 매칭 결과·메시지를 받지 못해요') · Card(InfoCard '새벽 0~7시는 자동으로
 *   알림이 가지 않아요')  [@dei/ui]
 * 의존 데이터: 본인 알림 수신 설정 (master ON/OFF — notification_settings/profiles
 *   flag, 테이블명 HTML 미명시)
 * 발생 이벤트(PostHog): S22:notification_settings_opened ·
 *   S22:notification_master_toggled
 * 서버 의존(L1): 알림 마스터 토글 저장 엔드포인트(HTML 미명시) /
 *   새벽 0~7시 발송 자동 차단(서버단 스케줄·푸시 게이트 — 사용자 설정 불필요)
 * 정책 의존(L2): 마스터 토글 1개 단순화(항목별 토글 MVP 제외) / 새벽 0~7시 발송
 *   차단(서버단 자동) / OFF 시 매칭·업로드·멘션 미수신(S07a 정신) /
 *   앱 토글 vs OS 권한 구분 안내
 * 와이어프레임 참조: all-screens S22
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(마스터 토글 row·설명 sub·새벽 차단 InfoCard)은 owner 가 채운다.
 */
export default function NotificationSettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">알림 설정</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S22
        </Text>
      </View>
    </SafeAreaView>
  );
}

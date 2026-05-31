import { useLocalSearchParams, useRouter } from 'expo-router';

import { AlertDialog } from '@dei/ui';
import { logger } from '@dei/shared';

/**
 * S12 — 촬영 실패 차등 alert (2종)
 * ==================================================================
 * 담당자: C
 * 화면 목적: S11 촬영 중 발생하는 2종 실패 케이스(하드웨어 오류 / 업로드 실패)에
 *           대한 차등 AlertDialog. 권한 거부는 S11a 로 분리.
 *
 * 임시 가정 (옵션 B 자동 채택 3건):
 *   [가정 1] reason normalize:
 *            'hardware_error' | 'hardware' → kind='hardware'
 *            그 외 (upload_failed 등) → kind='upload' (fallback info)
 *   [가정 2] capture_failure_alert_shown 이벤트는 본 화면에서 발사 X.
 *            호출원(S11/S11b)이 이미 발사 중 — 중복 방지.
 *   [가정 3] "지금 재시도" = router.back() (옵션 b).
 *            localUri 가 없어 직접 uploadClip 재호출 불가 — upload-preview 로 복귀.
 *
 * 의존 DS 컴포넌트: AlertDialog (size=mini, severityTopBorder) [@dei/ui]
 * 발생 이벤트(PostHog): S12:capture_failure_alert_shown — 호출원 책임 (가정 2)
 * 정책 의존(L2): 로컬 영상 보관 기한 30일 · 백그라운드 자동 재시도 (네트워크 복구 트리거)
 */

function normalizeReason(raw: string | undefined): 'hardware' | 'upload' {
  // [가정 1] hardware_error / hardware → 'hardware', 나머지 → 'upload'
  if (raw === 'hardware_error' || raw === 'hardware') return 'hardware';
  return 'upload';
}

export default function CaptureFailedScreen() {
  const router = useRouter();
  const { roomId, reason } = useLocalSearchParams<{
    roomId: string;
    reason?: string;
  }>();

  const kind = normalizeReason(reason);

  const handleBack = () => {
    router.back();
  };

  const handleRetryHardware = () => {
    try {
      router.replace({
        pathname: '/(app)/room/[roomId]/upload-preview',
        params: { roomId },
      });
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'capture-failed', step: 'retry-hardware' },
        extra: { roomId, reason },
      });
      router.back();
    }
  };

  const handleRetryUpload = () => {
    router.back();
  };

  if (kind === 'hardware') {
    return (
      <AlertDialog
        testID="capture-failed-dialog"
        visible
        size="mini"
        tone="danger"
        severityTopBorder
        eyebrow="하드웨어 오류"
        title="카메라를 사용할 수 없어요"
        description="다른 앱이 카메라를 점유 중이거나 기기 문제일 수 있어요."
        onDismiss={handleBack}
        onRequestClose={handleBack}
        actions={[
          {
            label: '취소',
            variant: 'secondary',
            testID: 'capture-failed-cancel',
            onPress: handleBack,
          },
          {
            label: '다시 시도',
            variant: 'ink',
            testID: 'capture-failed-retry',
            onPress: handleRetryHardware,
          },
        ]}
      />
    );
  }

  return (
    <AlertDialog
      testID="capture-failed-dialog"
      visible
      size="mini"
      tone="info"
      severityTopBorder
      eyebrow="업로드 실패"
      title="네트워크가 약해요"
      description="영상은 저장됐어요. 연결되면 자동으로 올려드려요."
      onDismiss={handleBack}
      onRequestClose={handleBack}
      actions={[
        {
          label: '확인',
          variant: 'secondary',
          testID: 'capture-failed-cancel',
          onPress: handleBack,
        },
        {
          label: '지금 재시도',
          variant: 'ink',
          testID: 'capture-failed-retry',
          onPress: handleRetryUpload,
        },
      ]}
    />
  );
}

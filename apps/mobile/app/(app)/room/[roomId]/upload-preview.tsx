import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';

import {
  AlertDialog,
  BottomActionBar,
  Button,
  FullscreenVideo,
  ProgressBar,
  Spinner,
} from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { uploadClip } from '@/lib/video';

export default function UploadPreviewScreen() {
  const router = useRouter();
  const { roomId, localUri, durationMs: durationMsParam } = useLocalSearchParams<{
    roomId: string;
    localUri: string;
    durationMs: string;
  }>();

  const durationMs = Number(durationMsParam);
  const safeDurationMs = Number.isNaN(durationMs) ? 0 : durationMs;

  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const player = useVideoPlayer(
    localUri ? { uri: localUri } : null,
    (p) => {
      p.loop = true;
      p.muted = false;
      p.play();
    },
  );

  const durationLabel = safeDurationMs > 0
    ? `● ${(safeDurationMs / 1000).toFixed(1)}초`
    : undefined;

  const handleClose = useCallback(() => {
    if (uploading) return;
    setDiscardConfirmVisible(true);
  }, [uploading]);

  const handleDiscardConfirm = useCallback(async () => {
    setDiscardConfirmVisible(false);
    if (localUri) {
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'upload-preview', step: 'discard-delete' },
          extra: { localUri },
        });
      }
    }
    router.back();
  }, [localUri, router]);

  const handleDiscardCancel = useCallback(() => {
    setDiscardConfirmVisible(false);
  }, []);

  const handleRetake = useCallback(async () => {
    if (uploading) return;
    if (localUri) {
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'upload-preview', step: 'retake-delete' },
          extra: { localUri },
        });
      }
    }
    router.back();
  }, [uploading, localUri, router]);

  const handleUpload = useCallback(async () => {
    if (uploading || !roomId || !localUri) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      await uploadClip(
        { roomId, localUri, durationMs: safeDurationMs },
        { onProgress: setUploadProgress },
      );
      router.replace({
        pathname: '/(app)/room/[roomId]',
        params: { roomId },
      });
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'upload-preview', step: 'upload-clip' },
        extra: { roomId, localUri },
      });
      analytics.capture(ANALYTICS_EVENTS.capture_failure_alert_shown, {
        roomId,
        reason: 'upload_failed',
      });
      router.push({
        pathname: '/(app)/room/[roomId]/capture-failed',
        params: { roomId, reason: 'upload_failed' },
      });
    } finally {
      setUploading(false);
    }
  }, [uploading, roomId, localUri, safeDurationMs, router]);

  return (
    <View className="flex-1 bg-black">
      <FullscreenVideo
        mode="preview"
        duration={durationLabel}
        onClose={uploading ? undefined : handleClose}
        bottomSlot={
          <View className="gap-[8px]">
            {uploading ? (
              <ProgressBar
                value={uploadProgress}
                height={4}
                className="bg-white/20"
                fillClassName="bg-white"
              />
            ) : null}
            <BottomActionBar layout="row">
              <Button
                testID="retake-button"
                variant="secondary"
                fullWidth
                disabled={uploading}
                onPress={() => { void handleRetake(); }}
              >
                다시 찍기
              </Button>
              <Button
                testID="upload-button"
                variant="ink"
                fullWidth
                disabled={uploading}
                onPress={() => { void handleUpload(); }}
              >
                올리기
              </Button>
            </BottomActionBar>
          </View>
        }
      >
        {localUri ? (
          <VideoView
            testID="preview-video"
            player={player}
            contentFit="contain"
            nativeControls={false}
            className="absolute inset-0"
          />
        ) : null}
      </FullscreenVideo>

      {uploading ? <Spinner variant="overlay" size={36} /> : null}

      <AlertDialog
        testID="discard-dialog"
        visible={discardConfirmVisible}
        tone="warn"
        size="lg"
        icon="⚠️"
        title="영상이 사라져요. 정말 닫을까요?"
        description="닫으면 방금 촬영한 영상이 삭제돼요."
        onDismiss={handleDiscardCancel}
        actions={[
          {
            label: '취소',
            variant: 'secondary',
            testID: 'discard-cancel-button',
            onPress: handleDiscardCancel,
          },
          {
            label: '네, 삭제할게요',
            variant: 'ink',
            testID: 'discard-confirm-button',
            onPress: () => { void handleDiscardConfirm(); },
          },
        ]}
      />
    </View>
  );
}

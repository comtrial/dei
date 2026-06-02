import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { Volume2, VolumeX } from 'lucide-react-native';

import {
  AlertDialog,
  BottomActionBar,
  Button,
  FullscreenVideo,
  ProgressBar,
  Spinner,
  Text,
} from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { uploadClip } from '@/lib/video';

export default function UploadPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { roomId, localUri, durationMs: durationMsParam, capturedAtIso } = useLocalSearchParams<{
    roomId: string;
    localUri: string;
    durationMs: string;
    capturedAtIso?: string;
  }>();

  const durationMs = Number(durationMsParam);
  const safeDurationMs = Number.isNaN(durationMs) ? 0 : durationMs;

  const capturedAtLabel = capturedAtIso
    ? (() => {
        const d = new Date(capturedAtIso);
        return Number.isNaN(d.getTime())
          ? null
          : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : null;

  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [muted, setMuted] = useState(false);

  const player = useVideoPlayer(
    localUri ? { uri: localUri } : null,
    (p) => {
      p.loop = true;
      p.muted = false;
      p.play();
    },
  );

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

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
        { roomId, localUri, durationMs: safeDurationMs, capturedAtIso, muted },
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
  }, [uploading, roomId, localUri, safeDurationMs, capturedAtIso, muted, router]);

  return (
    <View className="flex-1 bg-black">
      <FullscreenVideo
        mode="preview"
        onClose={uploading ? undefined : handleClose}
      >
        {localUri ? (
          <VideoView
            testID="preview-video"
            player={player}
            contentFit="contain"
            nativeControls={false}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
      </FullscreenVideo>

      <Pressable
        testID="mute-toggle"
        accessibilityRole="button"
        accessibilityLabel={muted ? '음소거 해제' : '음소거'}
        onPress={() => setMuted((m) => !m)}
        disabled={uploading}
        hitSlop={16}
        className={`absolute right-5 w-11 h-11 rounded-full bg-black/55 items-center justify-center z-30 ${uploading ? 'opacity-30' : ''}`}
        style={[{ top: insets.top + 12 }]}
      >
        {muted ? <VolumeX color="white" size={22} /> : <Volume2 color="white" size={22} />}
      </Pressable>

      {capturedAtLabel ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <Text className="text-white text-[56px] font-extrabold tracking-[2px] opacity-75">
            {capturedAtLabel}
          </Text>
        </View>
      ) : null}

      <View className="absolute bottom-0 left-0 right-0">
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
            variant="accent"
            fullWidth
            disabled={uploading}
            onPress={() => { void handleUpload(); }}
          >
            올리기
          </Button>
        </BottomActionBar>
      </View>

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

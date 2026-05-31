import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Pressable, View } from 'react-native';

import { Camera, CameraView } from 'expo-camera';
import type { RefObject } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { IconButton, ProgressBar, Text, Toggle } from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { X, RefreshCw, Mic } from 'lucide-react-native';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getPermissionState } from '@/lib/permissions';
import { recordClip } from '@/lib/video';

const PROGRESS_INTERVAL_MS = 150;

export default function VideoCaptureScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [micEnabled, setMicEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkPermission() {
      try {
        const state = await getPermissionState('camera');
        if (cancelled) return;
        if (state !== 'granted') {
          router.replace('/(app)/permission/camera');
        }
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'video-capture', step: 'permission-check' },
          extra: { roomId },
        });
        if (!cancelled) {
          router.replace('/(app)/permission/camera');
        }
      }
    }

    void checkPermission();
    return () => {
      cancelled = true;
    };
  }, [router, roomId]);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.video_capture_entered, { roomId });
  }, [roomId]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          (nextState === 'inactive' || nextState === 'background') &&
          recordingRef.current
        ) {
          void stopRecording();
        }
      },
    );
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    clearProgressTimer();
    try {
      cameraRef.current?.stopRecording();
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'video-capture', step: 'stop-recording' },
        extra: { roomId },
      });
    }
  }, [clearProgressTimer, roomId]);

  const handleShutterPressIn = useCallback(async () => {
    if (isRecording) return;

    setIsRecording(true);
    recordingRef.current = true;
    setProgress(0);

    const startTime = Date.now();
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const next = Math.min(elapsed / 3000, 1);
      setProgress(next);
      if (next >= 1) {
        clearProgressTimer();
      }
    }, PROGRESS_INTERVAL_MS);

    try {
      const result = await recordClip(cameraRef as unknown as RefObject<never>);
      clearProgressTimer();
      setIsRecording(false);
      recordingRef.current = false;
      setProgress(0);

      router.push({
        pathname: '/(app)/room/[roomId]/upload-preview',
        params: {
          roomId: roomId ?? '',
          localUri: result.localUri,
          durationMs: String(result.durationMs),
        },
      });
    } catch (err) {
      clearProgressTimer();
      setIsRecording(false);
      recordingRef.current = false;
      setProgress(0);

      logger.captureException(err, {
        tags: { feature: 'video-capture', step: 'record-clip' },
        extra: { roomId },
      });

      analytics.capture(ANALYTICS_EVENTS.capture_failure_alert_shown, {
        roomId,
        reason: 'hardware_error',
      });
      router.push({
        pathname: '/(app)/room/[roomId]/capture-failed',
        params: { roomId: roomId ?? '', reason: 'hardware_error' },
      });
    }
  }, [clearProgressTimer, isRecording, roomId, router]);

  const handleShutterPressOut = useCallback(async () => {
    if (!recordingRef.current) return;
    await stopRecording();
  }, [stopRecording]);

  const handleFlip = useCallback(() => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const handleMicToggle = useCallback(async (next: boolean) => {
    if (!next) {
      setMicEnabled(false);
      return;
    }

    try {
      const { status } = await Camera.requestMicrophonePermissionsAsync();
      if (status === 'granted') {
        setMicEnabled(true);
      } else {
        setMicEnabled(false);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 1000);
      }
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'video-capture', step: 'mic-permission' },
        extra: { roomId },
      });
      setMicEnabled(false);
    }
  }, [roomId]);

  return (
    <View className="flex-1 bg-black">
      <View className="flex-1 aspect-video overflow-hidden">
        <CameraView
          ref={cameraRef}
          className="flex-1"
          mode="video"
          facing={facing}
          videoQuality="720p"
          mute={!micEnabled}
        />
      </View>

      <View className="absolute inset-0">
        <View className="px-4 pt-14">
          <ProgressBar
            value={progress}
            height={4}
            className="w-full"
            fillClassName="bg-white"
          />
        </View>

        <View className="absolute left-4 top-12">
          <IconButton
            glyph={X}
            variant="glass"
            size={36}
            iconSize={18}
            accessibilityLabel="닫기"
            onPress={() => router.back()}
          />
        </View>

        <View className="absolute right-4 top-12">
          <IconButton
            glyph={RefreshCw}
            variant="glass"
            size={36}
            iconSize={18}
            accessibilityLabel="카메라 전환"
            onPress={handleFlip}
          />
        </View>

        <View className="absolute bottom-0 left-0 right-0 pb-10 items-center gap-4">
          <Text variant="caption" className="text-white text-center opacity-80">
            길게 눌러서 녹화 · 최대 3초
          </Text>

          <Pressable
            testID="shutter-button"
            accessibilityRole="button"
            accessibilityLabel="녹화 시작"
            className="h-[88px] w-[88px] rounded-full bg-white items-center justify-center"
            onPressIn={() => { void handleShutterPressIn(); }}
            onPressOut={() => { void handleShutterPressOut(); }}
          >
            <View
              className={
                isRecording
                  ? 'h-[24px] w-[24px] rounded-md bg-accent'
                  : 'h-[64px] w-[64px] rounded-full bg-accent'
              }
            />
          </Pressable>

          <View className="flex-row items-center gap-2">
            <Mic color="white" size={16} />
            <Text variant="caption" className="text-white">
              음성
            </Text>
            <Toggle
              testID="mic-toggle"
              value={micEnabled}
              onValueChange={(next) => { void handleMicToggle(next); }}
            />
          </View>
        </View>

        {toastVisible && (
          <View className="absolute bottom-40 left-0 right-0 items-center">
            <View className="bg-glass-dark rounded-lg px-4 py-2">
              <Text variant="caption" className="text-white">
                마이크 권한이 거부되었어요
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, type AppStateStatus, Easing, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Camera, CameraView } from 'expo-camera';
import type { RefObject } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { lockToLandscape, unlockAllOrientations, LandscapeDirection } from 'react-native-orientation-turbo';

import { Text } from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { X, RefreshCcw } from 'lucide-react-native';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getPermissionState } from '@/lib/permissions';
import { recordClip } from '@/lib/video';

const RECORD_MAX_MS = 3000;

export default function VideoCaptureScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [overlayMounted, setOverlayMounted] = useState(true);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    setCameraReady(false);
    setIsRecording(false);
    setOverlayMounted(true);
    progressAnim.setValue(0);
    overlayOpacity.setValue(1);

    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${h}:${m}`);
    };
    updateTime();
    const timerId = setInterval(updateTime, 10000);

    setIsFocused(true);

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    const lockTimer = setTimeout(() => {
      try {
        lockToLandscape(LandscapeDirection.RIGHT);
      } catch (err) {
        logger.captureException(err, { tags: { feature: 'video-capture', action: 'lock-orientation' } });
      }
      fadeTimer = setTimeout(() => {
        overlayAnimRef.current = Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        });
        overlayAnimRef.current.start(({ finished }) => {
          if (finished) setOverlayMounted(false);
        });
      }, 250);
    }, 350);

    return () => {
      clearTimeout(lockTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      clearInterval(timerId);
      setIsFocused(false);
      setCameraReady(false);
      recordingRef.current = false;
      progressAnimRef.current?.stop();
      progressAnimRef.current = null;
      progressAnim.setValue(0);
      overlayAnimRef.current?.stop();
      overlayAnimRef.current = null;
      overlayOpacity.setValue(1);
      setOverlayMounted(true);
      try {
        unlockAllOrientations();
      } catch (err) {
        logger.captureException(err, { tags: { feature: 'video-capture', action: 'unlock-orientation' } });
      }
    };
  }, [overlayOpacity, progressAnim]));

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
        logger.captureException(err, { tags: { feature: 'video-capture', step: 'permission-check' } });
        if (!cancelled) router.replace('/(app)/permission/camera');
      }
    }
    void checkPermission();
    return () => { cancelled = true; };
  }, [router, roomId]);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.video_capture_entered, { roomId });
  }, [roomId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if ((state === 'inactive' || state === 'background') && recordingRef.current) {
        void stopRecording();
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetProgress = useCallback(() => {
    progressAnimRef.current?.stop();
    progressAnimRef.current = null;
    progressAnim.setValue(0);
  }, [progressAnim]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    try {
      cameraRef.current?.stopRecording();
    } catch (err) {
      logger.captureException(err, { tags: { feature: 'video-capture', step: 'stop-recording' } });
    }
  }, []);

  const handleShutterPressIn = useCallback(async () => {
    if (isRecording || !cameraReady) return;

    setIsRecording(true);
    recordingRef.current = true;

    const capturedAtIso = new Date().toISOString();

    progressAnim.setValue(0);
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: RECORD_MAX_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();

    try {
      const result = await recordClip(cameraRef as unknown as RefObject<never>);
      resetProgress();
      setIsRecording(false);
      recordingRef.current = false;
      router.push({
        pathname: '/(app)/room/[roomId]/upload-preview',
        params: { roomId: roomId ?? '', localUri: result.localUri, durationMs: String(result.durationMs), capturedAtIso },
      });
    } catch (err) {
      resetProgress();
      setIsRecording(false);
      recordingRef.current = false;
      logger.captureException(err, { tags: { feature: 'video-capture', step: 'record-clip' }, extra: { roomId } });
      analytics.capture(ANALYTICS_EVENTS.capture_failure_alert_shown, { roomId, reason: 'hardware_error' });
      router.push({ pathname: '/(app)/room/[roomId]/capture-failed', params: { roomId: roomId ?? '', reason: 'hardware_error' } });
    }
  }, [cameraReady, isRecording, progressAnim, resetProgress, roomId, router]);

  const handleShutterPressOut = useCallback(async () => {
    if (!recordingRef.current) return;
    await stopRecording();
  }, [stopRecording]);

  return (
    <View style={StyleSheet.absoluteFill} className="bg-black">
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          videoQuality="720p"
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {/* progress bar — 상단 전체 너비 (landscape 기준), 촬영 중만 표시 */}
      {isRecording && (
        <View className="absolute top-0 left-0 right-0" style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <Animated.View
            style={{
              height: 3,
              backgroundColor: '#ff3b6b',
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
      )}

      {/* X 버튼 — 좌상단 (landscape) */}
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        disabled={isRecording}
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isRecording ? 0.3 : 1,
          zIndex: 10,
        }}
      >
        <X color="white" size={22} />
      </TouchableOpacity>

      {/* 카메라 전환 — 우상단 (landscape) */}
      <TouchableOpacity
        onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        disabled={isRecording}
        hitSlop={16}
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(255,59,107,0.2)',
          borderWidth: 1,
          borderColor: 'rgba(255,59,107,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isRecording ? 0.3 : 1,
          zIndex: 10,
        }}
      >
        <RefreshCcw color="#ff3b6b" size={20} />
      </TouchableOpacity>

      {/* 시간 — 화면 중앙 (landscape 정방향) */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          style={{
            color: 'white',
            fontSize: 56,
            fontWeight: '800',
            letterSpacing: 2,
            opacity: 0.75,
          }}
        >
          {currentTime}
        </Text>
      </View>

      {/* 셔터 + 안내 텍스트 — 우중앙 (landscape, 오른손 엄지) */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, bottom: 0, right: 24, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 14 }}>
          {isRecording ? '촬영 중…' : '꾹 눌러서 녹화'}
        </Text>
        <Pressable
          testID="shutter-button"
          accessibilityRole="button"
          accessibilityLabel="녹화 시작"
          disabled={!cameraReady}
          onPressIn={() => { void handleShutterPressIn(); }}
          onPressOut={() => { void handleShutterPressOut(); }}
          style={({ pressed }) => ({
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 4,
            borderColor: '#ff3b6b',
            backgroundColor: 'rgba(255,59,107,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !cameraReady ? 0.35 : pressed ? 0.75 : 1,
          })}
        >
          <View
            style={{
              width: isRecording ? 26 : 62,
              height: isRecording ? 26 : 62,
              borderRadius: isRecording ? 6 : 31,
              backgroundColor: '#ff3b6b',
            }}
          />
        </Pressable>
      </View>

      {overlayMounted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'black', opacity: overlayOpacity, zIndex: 100 },
          ]}
        />
      ) : null}
    </View>
  );
}

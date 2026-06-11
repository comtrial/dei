import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, type AppStateStatus, Easing, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { CameraView } from 'expo-camera';
import type { RefObject } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Text, color } from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { X, RefreshCcw } from 'lucide-react-native';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getPermissionState } from '@/lib/permissions';
import { recordClip } from '@/lib/video';

const RECORD_AUTO_MS = 2000;

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
  // 권한 grant 직후 첫 마운트된 CameraView 가 초기화되지 않아(expo-camera#31597,
  // onCameraReady 미호출 → 흰 화면) 셔터가 영영 활성화 안 되는 문제. key 를 바꿔
  // 강제 재마운트하면 카메라 세션이 새로 초기화된다.
  const [cameraKey, setCameraKey] = useState(0);
  const remountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const fadeTimer = setTimeout(() => {
      overlayAnimRef.current = Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      });
      overlayAnimRef.current.start(({ finished }) => {
        if (finished) setOverlayMounted(false);
      });
    }, 350);

    // onCameraReady 가 끝내 안 불리면(흰 화면) 한 번 더 강제 재마운트한다.
    remountTimerRef.current = setTimeout(() => {
      setCameraReady((ready) => {
        if (!ready) setCameraKey((k) => k + 1);
        return ready;
      });
    }, 1200);

    return () => {
      clearTimeout(fadeTimer);
      clearInterval(timerId);
      if (remountTimerRef.current) {
        clearTimeout(remountTimerRef.current);
        remountTimerRef.current = null;
      }
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
      // 포그라운드 복귀 시 카메라 세션을 재마운트해 초기화되지 않은 프리뷰를 살린다.
      if (state === 'active' && !recordingRef.current) {
        setCameraReady(false);
        setCameraKey((k) => k + 1);
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

  const handleShutterPress = useCallback(async () => {
    if (isRecording || !cameraReady) return;

    setIsRecording(true);
    recordingRef.current = true;

    const capturedAtIso = new Date().toISOString();

    progressAnim.setValue(0);
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: RECORD_AUTO_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();

    try {
      const result = await recordClip(cameraRef as unknown as RefObject<never>, { maxDurationMs: RECORD_AUTO_MS });
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

  return (
    <View style={StyleSheet.absoluteFill} className="bg-black">
      {isFocused && (
        <CameraView
          key={`cam-${cameraKey}-${facing}`}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          videoQuality="720p"
          // 화면 lock 은 portrait 이지만 디자인상 phone 을 landscape 로 들도록 강제
          // (시간 rotate-90). 이 prop 없으면 첫 녹화가 interface(portrait) 기준
          // 9:16 영상으로 저장돼 검수에서 일관성 깨짐 — CMMotionManager 로 physical
          // orientation 감지해 16:9 landscape 영상 보장. (cdadcdd→f03ae60 cycle 반복 방지)
          responsiveOrientationWhenOrientationLocked
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {isRecording && (
        <View className="absolute top-0 bottom-0 right-0 w-[3px] bg-white/20">
          <Animated.View
            className="w-[3px] bg-accent"
            style={[
              {
                height: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
      )}

      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        disabled={isRecording}
        className={`absolute top-14 left-6 w-11 h-11 rounded-full bg-black/50 items-center justify-center z-10 ${isRecording ? 'opacity-30' : ''}`}
      >
        <X color="white" size={22} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        disabled={isRecording}
        hitSlop={16}
        className={`absolute top-14 right-6 w-11 h-11 rounded-full bg-accent/20 border border-accent/50 items-center justify-center z-10 ${isRecording ? 'opacity-30' : ''}`}
      >
        <RefreshCcw color={color.accent} size={20} />
      </TouchableOpacity>

      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center"
      >
        <View className="rotate-90">
          <Text className="text-white text-[56px] font-extrabold tracking-[2px] opacity-75">
            {currentTime}
          </Text>
        </View>
      </View>

      <View
        pointerEvents="box-none"
        className="absolute bottom-16 left-0 right-0 items-center"
      >
        <Pressable
          testID="shutter-button"
          accessibilityRole="button"
          accessibilityLabel="녹화 시작"
          disabled={!cameraReady || isRecording}
          onPress={() => { void handleShutterPress(); }}
          style={({ pressed }) => ({
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 4,
            borderColor: color.accent,
            backgroundColor: 'rgba(255,45,111,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !cameraReady ? 0.35 : pressed ? 0.75 : 1,
          })}
        >
          <View
            className={
              isRecording
                ? 'w-[26px] h-[26px] rounded-[6px] bg-accent'
                : 'w-[62px] h-[62px] rounded-[31px] bg-accent'
            }
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

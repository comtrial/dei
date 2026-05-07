import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { RotateCcw, X, Zap } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useTodayClip } from '@/hooks/useTodayClip';
import { formatDuration } from '@/lib/formatDuration';

type CameraFacing = 'front' | 'back';

const ZOOM_LEVELS = [
  { label: '0.5', value: 0 },
  { label: '1', value: 0 },
  { label: '2', value: 0.07 },
] as const;

const RECORD_DURATION_MS = 3000;
const RING_SIZE = 92;
const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const { hasClipToday, currentSlotLabel, isLoading: clipLoading } = useTodayClip();

  const [facing, setFacing] = useState<CameraFacing>('back');
  const [flashOn, setFlashOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const didInitRef = useRef(false);

  const elapsedMsRef = useRef(0);
  const [displayMs, setDisplayMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  useFocusEffect(
    useCallback(() => {
      didInitRef.current = false;
      return () => {
        didInitRef.current = false;
        setShowPermissionDialog(false);
        setShowOverwriteDialog(false);
        stopAnimations();
        setIsRecording(false);
        setDisplayMs(0);
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (clipLoading || !permission || didInitRef.current) return;
      didInitRef.current = true;

      if (permission.status === 'undetermined') {
        setShowPermissionDialog(true);
      } else if (permission.status === 'denied') {
        router.back();
      } else if (permission.status === 'granted' && hasClipToday) {
        setShowOverwriteDialog(true);
      }
    }, [permission, hasClipToday, clipLoading, router])
  );

  useEffect(() => {
    return () => stopAnimations();
  }, []);

  const stopAnimations = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    progressAnim.stopAnimation();
    barAnim.stopAnimation();
  };

  const startAnimations = () => {
    elapsedMsRef.current = 0;
    setDisplayMs(0);

    progressAnim.setValue(0);
    barAnim.setValue(0);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: RECORD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    Animated.timing(barAnim, {
      toValue: 1,
      duration: RECORD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      elapsedMsRef.current += 100;
      setDisplayMs(elapsedMsRef.current);
    }, 100);
  };

  const handleAllowPermission = async () => {
    setShowPermissionDialog(false);
    const camResult = await requestPermission();
    if (camResult.status !== 'granted') {
      router.back();
      return;
    }
    await requestMicPermission();
    if (hasClipToday) setShowOverwriteDialog(true);
  };

  const handleDenyPermission = () => {
    setShowPermissionDialog(false);
    router.back();
  };

  const handleOverwriteConfirm = () => setShowOverwriteDialog(false);
  const handleOverwriteCancel = () => {
    setShowOverwriteDialog(false);
    router.back();
  };

  const handleShutterPress = async () => {
    console.log('[RecordScreen] Shutter pressed. cameraRef:', !!cameraRef.current, 'isRecording:', isRecording);

    if (isRecording) return;

    if (!cameraRef.current) {
      console.warn('[RecordScreen] cameraRef is null — CameraView not mounted yet');
      return;
    }

    // CameraView 마운트 이후 마이크 권한 확인
    if (micPermission?.status !== 'granted') {
      const micResult = await requestMicPermission();
      if (micResult.status !== 'granted') {
        console.warn('[RecordScreen] Microphone permission denied');
        return;
      }
    }

    setIsRecording(true);
    startAnimations();

    // 시뮬레이터: 녹화 불가 → 3초 대기 후 결과 화면으로 이동 (UI 테스트용)
    if (!Constants.isDevice) {
      await new Promise<void>((resolve) => setTimeout(resolve, RECORD_DURATION_MS));
      stopAnimations();
      setIsRecording(false);
      router.push({
        pathname: '/result',
        params: { uri: '', durationMs: String(RECORD_DURATION_MS) },
      });
      return;
    }

    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: RECORD_DURATION_MS / 1000 });
      stopAnimations();
      setIsRecording(false);

      if (result?.uri) {
        router.push({
          pathname: '/result',
          params: { uri: result.uri, durationMs: String(elapsedMsRef.current || RECORD_DURATION_MS) },
        });
      }
    } catch (e) {
      console.error('[RecordScreen] recordAsync failed:', e);
      stopAnimations();
      setIsRecording(false);
    }
  };

  const handleStopPress = () => {
    // 3초 미만이면 무시; 자동 정지가 먼저 트리거되므로 실질적으로 동작 안 함
    if (elapsedMsRef.current < RECORD_DURATION_MS) return;
    cameraRef.current?.stopRecording();
  };

  // CameraView 렌더링은 카메라 권한만으로 충분. 마이크는 recordAsync 직전에 확인
  const isGranted = permission?.status === 'granted';
  const timerColor = isRecording ? '#C0432A' : 'white';

  return (
    <View className="flex-1 bg-[#1A1008]">
      {/* Camera */}
      {isGranted && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            mode="video"
            facing={facing}
            flash={flashOn ? 'on' : 'off'}
            zoom={ZOOM_LEVELS[zoomIndex].value}
          />
        </View>
      )}

      {/* Progress bar (bottom of viewfinder, above controls) */}
      {isRecording && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 120,
            left: 0,
            height: 2,
            backgroundColor: '#C0432A',
            width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      )}

      {/* Top bar */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-5"
        style={{ top: insets.top + 12 }}>
        <TouchableOpacity
          onPress={() => !isRecording && router.back()}
          hitSlop={12}
          style={{ opacity: isRecording ? 0.3 : 1 }}
          disabled={isRecording}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-black/30">
            <X size={18} color="white" />
          </View>
        </TouchableOpacity>

        <View className="items-center">
          <Text
            className="font-mono text-base font-semibold"
            style={{ color: timerColor }}>
            {formatDuration(displayMs)}
          </Text>
          <View className="mt-1 flex-row gap-1">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isRecording ? '#C0432A' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => !isRecording && setFlashOn((v) => !v)}
          hitSlop={12}
          style={{ opacity: isRecording ? 0.3 : 1 }}
          disabled={isRecording}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-black/30">
            <Zap size={18} color={flashOn ? '#FFD700' : 'white'} fill={flashOn ? '#FFD700' : 'none'} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Focus frame */}
      <View className="absolute inset-0 items-center justify-center">
        <View style={{ width: 128, height: 128, borderWidth: 2, borderColor: '#C8A84B', borderRadius: 4 }} />
      </View>

      {/* Zoom buttons */}
      <View
        className="absolute flex-row items-center gap-4"
        style={{ bottom: insets.bottom + 108, alignSelf: 'center', left: 0, right: 0, justifyContent: 'center' }}>
        {ZOOM_LEVELS.map((level, index) => (
          <TouchableOpacity key={level.label} onPress={() => setZoomIndex(index)} hitSlop={12} disabled={isRecording}>
            <View
              style={{
                backgroundColor: index === zoomIndex ? 'rgba(255,255,255,0.2)' : 'transparent',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
              <Text
                style={{
                  fontFamily: 'monospace',
                  fontSize: index === zoomIndex ? 15 : 13,
                  fontWeight: index === zoomIndex ? '700' : '400',
                  color: index === zoomIndex ? 'white' : 'rgba(255,255,255,0.5)',
                }}>
                {level.label}×
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* REAR / FRONT */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 92, left: 20 }}>
        <Text style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {facing === 'back' ? 'REAR' : 'FRONT'}
        </Text>
      </View>

      {/* Bottom controls */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-10"
        style={{ bottom: insets.bottom + 32 }}>
        {/* Flip — disabled during recording */}
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          hitSlop={12}
          style={{ opacity: isRecording ? 0.3 : 1 }}
          disabled={isRecording}>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <RotateCcw size={22} color="white" />
          </View>
        </TouchableOpacity>

        {/* Shutter with progress ring */}
        <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
          {/* SVG progress ring (recording state) */}
          {isRecording && (
            <Svg
              width={RING_SIZE}
              height={RING_SIZE}
              style={{ position: 'absolute' }}>
              {/* Background track */}
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={3}
                fill="none"
              />
              {/* Progress arc */}
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="#C0432A"
                strokeWidth={3}
                fill="none"
                strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
          )}

          {/* Shutter button */}
          <TouchableOpacity
            onPress={isRecording ? handleStopPress : handleShutterPress}
            activeOpacity={0.8}
            hitSlop={8}>
            {isRecording ? (
              // Stop icon: white rounded square
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  backgroundColor: 'white',
                }}
              />
            ) : (
              // Shutter: white circle
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  borderWidth: 4,
                  borderColor: 'white',
                  backgroundColor: 'white',
                }}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* NO CLIP / Today clip indicator */}
        <TouchableOpacity hitSlop={12} disabled={isRecording}>
          <View className="h-12 w-12 items-center justify-center rounded border border-white/40">
            <Text className="text-center font-mono text-[9px] font-semibold leading-tight text-white">
              NO{'\n'}CLIP
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 01B · Permission dialog */}
      <Modal visible={showPermissionDialog} transparent animationType="fade" statusBarTranslucent>
        <View className="flex-1 items-center justify-center bg-black/60 px-6">
          <View className="w-full rounded-xl bg-[#F5EDDB] p-6">
            <Text className="mb-2 text-lg font-bold text-[#171310]">카메라 접근 허용</Text>
            <Text className="mb-6 text-sm leading-relaxed text-[#6E6354]">
              dei.가 영상을 촬영하려면 카메라와 마이크 접근이 필요합니다.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleDenyPermission}
                className="flex-1 items-center rounded-lg border border-[#C9BB9E] bg-white py-3">
                <Text className="text-sm font-medium text-[#171310]">허용 안 함</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAllowPermission}
                className="flex-1 items-center rounded-lg bg-[#171310] py-3">
                <Text className="text-sm font-semibold text-white">허용</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 01C · Overwrite dialog */}
      <Modal visible={showOverwriteDialog} transparent animationType="fade" statusBarTranslucent>
        <View className="flex-1 items-center justify-center bg-black/60 px-6">
          <View className="w-full rounded-xl bg-[#F5EDDB] p-6">
            <Text className="mb-2 text-lg font-bold text-[#171310]">
              {currentSlotLabel}에 이미 촬영된 로그가 있습니다.
            </Text>
            <Text className="mb-6 text-sm leading-relaxed text-[#6E6354]">
              새로 촬영하면 기존 로그가 교체됩니다. 이전 클립은 복구되지 않아요.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleOverwriteCancel}
                className="flex-1 items-center rounded-lg border border-[#C9BB9E] bg-white py-3">
                <Text className="text-sm font-medium text-[#171310]">취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOverwriteConfirm}
                className="flex-1 items-center rounded-lg bg-[#C0432A] py-3">
                <Text className="text-sm font-semibold text-white">다시 촬영</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

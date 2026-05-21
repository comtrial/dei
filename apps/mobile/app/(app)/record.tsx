import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '@dei/shared';

import { Text } from '@/components/ui/text';
import { useTodayClip } from '@/hooks/useTodayClip';
import { clearRecordingUri, setRecordingUri } from '@/lib/recordingStore';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

type CameraFacing = 'front' | 'back';

const ZOOM_LEVELS = [
  { label: '1', value: 0.05 },
  { label: '2', value: 0.15 },
] as const;

const RECORD_DURATION_MS = 2000;
const RING_SIZE = 92;

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const { user } = useAuth();
  const { eligibility, refresh } = useAccountGate();
  const { hasClipToday, currentSlotLabel, isLoading: clipLoading } = useTodayClip(user?.id);

  const [isFocused, setIsFocused] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const didInitRef = useRef(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const stopAnimations = useCallback(() => {
    progressAnim.stopAnimation();
    barAnim.stopAnimation();
  }, [barAnim, progressAnim]);

  useFocusEffect(
    useCallback(() => {
      didInitRef.current = false;
      // stale state 초기화 — Tabs 는 unmount 안 하므로 진입 때마다 reset 필수
      setFacing('back');
      setZoomIndex(0);
      setIsRecording(false);
      // 가로 모드 잠금 완료 후 CameraView 마운트 → AVSession 활성 중 방향 전환 크래시 방지
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .then(() => setIsFocused(true))
        .catch((err) => {
          logger.captureException(err, {
            tags: { feature: 'record', action: 'lock-orientation' },
          });
          setIsFocused(true); // 잠금 실패해도 카메라는 보여줌
        });
      return () => {
        setIsFocused(false); // 포커스 잃으면 CameraView 언마운트 → AVSession 해제
        didInitRef.current = false;
        setShowPermissionDialog(false);
        setShowOverwriteDialog(false);
        stopAnimations();
        setIsRecording(false);
        // 화면 방향 잠금 해제 (app.json의 기본 orientation인 portrait로 자동 복귀)
        ScreenOrientation.unlockAsync().catch((err) => {
          logger.captureException(err, {
            tags: { feature: 'record', action: 'unlock-orientation' },
          });
        });
      };
    }, [stopAnimations])
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
  }, [stopAnimations]);

  const startAnimations = () => {
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
  };

  const handleAllowPermission = async () => {
    setShowPermissionDialog(false);
    try {
      const camResult = await requestPermission();
      if (camResult.status !== 'granted') {
        router.back();
        return;
      }
      await requestMicPermission();
      if (hasClipToday) setShowOverwriteDialog(true);
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'record', action: 'request-permissions' },
      });
      router.back();
    }
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

  const navigateToResult = useCallback(
    async (uri: string) => {
      const latestEligibility = await refresh().catch(() => eligibility);
      const nextStep = latestEligibility?.next_step ?? eligibility?.next_step;

      setRecordingUri(uri);
      setIsFocused(false);
      setTimeout(() => {
        router.push({
          pathname: '/result',
          params: {
            durationMs: String(RECORD_DURATION_MS),
            purpose: nextStep === 'first_video' ? 'profile' : 'daily',
          },
        });
      }, 600);
    },
    [eligibility, refresh, router],
  );

  const handleShutterPress = async () => {
    if (isRecording) return;
    clearRecordingUri();

    if (!cameraRef.current) {
      Alert.alert('촬영 준비 중', '카메라가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // CameraView 마운트 이후 마이크 권한 확인
    if (micPermission?.status !== 'granted') {
      const micResult = await requestMicPermission();
      if (micResult.status !== 'granted') {
        Alert.alert('마이크 권한 필요', '로그 촬영을 위해 마이크 권한이 필요해요.');
        return;
      }
    }

    setIsRecording(true);
    startAnimations();

    let stopTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      stopTimer = setTimeout(() => {
        cameraRef.current?.stopRecording();
      }, RECORD_DURATION_MS);
      const result = await cameraRef.current.recordAsync({ maxDuration: RECORD_DURATION_MS / 1000 });

      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }

      stopAnimations();
      setIsRecording(false);

      if (result?.uri) {
        await navigateToResult(result.uri);
        return;
      }

      Alert.alert('촬영 실패', '촬영 파일을 만들지 못했어요. 다시 촬영해 주세요.');
    } catch (e) {
      if (stopTimer) {
        clearTimeout(stopTimer);
      }
      logger.captureException(e, {
        tags: { feature: 'record', action: 'record-video' },
      });
      stopAnimations();
      setIsRecording(false);
      Alert.alert('촬영 실패', '촬영 파일을 저장하지 못했어요. 다시 촬영해 주세요.');
    }
  };

  // CameraView 렌더링은 카메라 권한만으로 충분. 마이크는 recordAsync 직전에 확인
  const isGranted = permission?.status === 'granted';
  // 상단 가운데 시계 — 현재 시각의 시 슬롯 (예: "21:00"). useTodayClip 의 currentSlotLabel 과 동일 정책.
  const currentHourLabel = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  const shouldMountCamera = isGranted && isFocused;

  return (
    <View className="flex-1 bg-[#1A1008]">
      {/* Camera — 포커스 상태일 때만 마운트. 백그라운드에서 AVSession 해제하여 result 화면 재생 가능하게 함 */}
      {/* flash 는 video 모드에서 torch 로만 동작 — UI 제거. selectedLens / onAvailableLensesChanged 는 native crash 이력으로 보류 */}
      {shouldMountCamera && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          zoom={facing === 'front' ? 0 : ZOOM_LEVELS[zoomIndex].value}
          onMountError={(event) => {
            logger.captureException(new Error(event?.message ?? 'CameraView onMountError'), {
              tags: { feature: 'record', action: 'camera-mount' },
              extra: { facing, zoomIndex },
            });
          }}
        />
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

      {/* 상단 바 — 가로 모드 */}
      <View 
        pointerEvents="box-none"
        className="absolute left-0 right-0 flex-row items-center justify-between"
        style={{ 
          top: insets.top + 12,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
          zIndex: 1000
        }}>
        {/* X 닫기 버튼 */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (isRecording) return;

            ScreenOrientation.unlockAsync().catch((err) => {
              logger.captureException(err, {
                tags: { feature: 'record', action: 'unlock-orientation-close' },
              });
            });
            setIsFocused(false);

            // AVSession 해제 시간을 주고 navigate (즉시 router.back 시 카메라 native view 와 충돌)
            setTimeout(() => {
              try {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(ROUTES.home as never);
                }
              } catch (err) {
                logger.captureException(err, {
                  tags: { feature: 'record', action: 'close-navigate' },
                });
              }
            }, 300);
          }}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={{
            opacity: isRecording ? 0.3 : 1,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          disabled={isRecording}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-black/30">
            <Ionicons name="close" size={20} color="white" />
          </View>
        </TouchableOpacity>

        {/* 현재 시각 (시 슬롯) — 녹화 ms 카운터 대신 표시 */}
        <View className="items-center">
          <Text
            className="font-mono text-base font-semibold"
            style={{ color: 'white' }}>
            {currentHourLabel}
          </Text>
        </View>

        {/* X 버튼과 동일 크기의 invisible spacer — 타이머 중앙 정렬 유지 (flash 버튼 제거됨) */}
        <View style={{ width: 44, height: 44 }} />
      </View>

      {/* Focus frame */}
      <View className="absolute inset-0 items-center justify-center">
        <View style={{ width: 128, height: 128, borderWidth: 2, borderColor: '#C8A84B', borderRadius: 4 }} />
      </View>

      {/* 왼쪽 세로 컨트롤 바 — 가로 모드 */}
      <View 
        className="absolute flex-col items-center gap-6"
        style={{ 
          left: insets.left + 20,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          zIndex: 100
        }}>
        {/* REAR / FRONT */}
        <Text style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {facing === 'back' ? 'REAR' : 'FRONT'}
        </Text>

        {/* 카메라 전환 버튼 */}
        <TouchableOpacity
          onPress={() => {
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          hitSlop={12}
          style={{ opacity: isRecording ? 0.3 : 1 }}
          disabled={isRecording}>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <Ionicons name="camera-reverse-outline" size={24} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Zoom buttons — 촬영 버튼 바로 위 (가로로 배치) */}
      <View
        className="absolute flex-row items-center gap-4"
        style={{ 
          right: insets.right + 32,
          bottom: '50%',
          marginBottom: RING_SIZE / 2 + 20,
          zIndex: 100
        }}>
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

      {/* 촬영 버튼 — 가로 모드에서 오른쪽 중앙 (오른손 엄지 위치) */}
      <View 
        style={{ 
          position: 'absolute',
          right: insets.right + 32,
          top: '50%',
          marginTop: -RING_SIZE / 2,
          width: RING_SIZE, 
          height: RING_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
        {isRecording && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
              borderWidth: 3,
              borderColor: '#C0432A',
              opacity: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 1],
              }),
              transform: [
                {
                  scale: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            }}
          />
        )}

        {/* Shutter button — 녹화 중엔 비활성 */}
        <TouchableOpacity
          onPress={handleShutterPress}
          activeOpacity={0.8}
          hitSlop={8}
          disabled={isRecording}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              borderWidth: 4,
              borderColor: 'white',
              backgroundColor: 'white',
              opacity: isRecording ? 0.3 : 1,
            }}
          />
        </TouchableOpacity>
      </View>

      {/* NO CLIP — 가로 모드에서 오른쪽 하단 */}
      <TouchableOpacity 
        hitSlop={12} 
        disabled={isRecording}
        style={{
          position: 'absolute',
          bottom: insets.bottom + 32,
          right: insets.right + 20,
          zIndex: 100
        }}>
        <View className="h-12 w-12 items-center justify-center rounded border border-white/40">
          <Text className="text-center font-mono text-[9px] font-semibold leading-tight text-white">
            NO{'\n'}CLIP
          </Text>
        </View>
      </TouchableOpacity>

      {/* 01B · Permission dialog */}
      <Modal
        visible={showPermissionDialog}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
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
      <Modal
        visible={showOverwriteDialog}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
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

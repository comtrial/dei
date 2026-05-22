import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '@dei/shared';

import { Text } from '@/components/ui/text';
import { useTodayClip } from '@/hooks/useTodayClip';
import {
  clearRecordingUri,
  consumeOverwriteAcknowledged,
  setRecordingUri,
} from '@/lib/recordingStore';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

type CameraFacing = 'front' | 'back';

const RECORD_DURATION_MS = 3000;
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
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  // CameraView 의 key. iOS 에서 RN <Modal> 이 카메라 위에 덮이는 동안 AVCaptureSession
  // 이 suspend 되었다가 dismiss 후에도 자동 restart 되지 않는 케이스가 있어, dialog 가
  // 닫힐 때 key 를 증가시켜 CameraView 를 unmount/remount → session 강제 재생성.
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const didInitRef = useRef(false);
  // long-press 녹화의 자동 stop 안전망 타이머 (max duration 도달 시 stopRecording 호출)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const stopAnimations = useCallback(() => {
    progressAnim.stopAnimation();
    barAnim.stopAnimation();
  }, [barAnim, progressAnim]);

  useFocusEffect(
    useCallback(() => {
      let mountTimer: ReturnType<typeof setTimeout> | null = null;

      // CameraView 마운트는 항상 ① orientation lock 완료 ② 80ms 안전 지연 후.
      // 80ms 는 다른 탭의 <VideoView> 들이 useIsFocused blur 로 인한 pause 를 native 측까지
      // 전파해 AVAudioSession 을 release 할 시간을 확보하기 위한 안전망. 사용자 체감 영향 X.
      const scheduleMount = () => {
        if (mountTimer) clearTimeout(mountTimer);
        mountTimer = setTimeout(() => setIsFocused(true), 80);
      };

      didInitRef.current = false;
      // stale state 초기화 — Tabs 는 unmount 안 하므로 진입 때마다 reset 필수
      setFacing('back');
      setIsRecording(false);
      // 가로 모드 잠금 완료 후 CameraView 마운트 → AVSession 활성 중 방향 전환 크래시 방지
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .then(scheduleMount)
        .catch((err) => {
          logger.captureException(err, {
            tags: { feature: 'record', action: 'lock-orientation' },
          });
          scheduleMount(); // 잠금 실패해도 카메라는 보여줌
        });

      // background 시 즉시 카메라 unmount (AVCaptureSession 해제).
      // foreground 복귀 시 orientation 재잠금 + 다시 mount 예약.
      const appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
            .then(scheduleMount)
            .catch(scheduleMount);
        } else {
          if (mountTimer) {
            clearTimeout(mountTimer);
            mountTimer = null;
          }
          setIsFocused(false);
        }
      });

      return () => {
        if (mountTimer) {
          clearTimeout(mountTimer);
          mountTimer = null;
        }
        appStateSub.remove();
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

      // result(검수) 화면의 "다시 촬영" 으로 돌아온 직후라면 1회성 ack 가 set 됨.
      // 직전에 사용자가 같은 dialog 를 confirm 한 의도를 존중해 중복 표시를 건너뛴다.
      const skipOverwrite = consumeOverwriteAcknowledged();

      if (permission.status === 'undetermined') {
        setShowPermissionDialog(true);
      } else if (permission.status === 'denied') {
        router.back();
      } else if (permission.status === 'granted' && hasClipToday && !skipOverwrite) {
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
      if (hasClipToday) {
        setShowOverwriteDialog(true);
      } else {
        // permission dialog 만 떴다 닫힌 경로 — session 재생성
        setCameraSessionKey((k) => k + 1);
      }
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

  const handleOverwriteConfirm = () => {
    setShowOverwriteDialog(false);
    // Modal 위 dismiss 후 카메라 session 이 stuck 되는 케이스 (사용자 보고: "다시 촬영"
    // 누른 직후 카메라 프리뷰 정지) 방지 — key 증가로 CameraView 를 강제 remount.
    setCameraSessionKey((k) => k + 1);
  };
  const handleOverwriteCancel = () => {
    setShowOverwriteDialog(false);
    router.back();
  };

  const navigateToResult = useCallback(
    async (uri: string) => {
      // refresh() 는 Supabase RPC 호출인데 SDK 가 자체 timeout 을 두지 않아 네트워크
      // 흔들림 시 영원히 pending → navigate 자체가 안 되는 간헐적 버그가 있다.
      // 2초 timeout 안전망: 응답 없으면 캐시된 eligibility 로 fallback 진행.
      const REFRESH_TIMEOUT_MS = 2000;
      const TIMEOUT_SENTINEL = Symbol('refresh-timeout');
      const refreshResult = await Promise.race([
        refresh().catch((err) => {
          logger.captureException(err, {
            tags: { feature: 'record', action: 'navigate-result-refresh' },
          });
          return null;
        }),
        new Promise<typeof TIMEOUT_SENTINEL>((resolve) =>
          setTimeout(() => resolve(TIMEOUT_SENTINEL), REFRESH_TIMEOUT_MS),
        ),
      ]);

      if (refreshResult === TIMEOUT_SENTINEL) {
        logger.captureMessage('refresh timeout during navigateToResult', 'warning', {
          tags: { feature: 'record', action: 'navigate-result-refresh-timeout' },
          extra: { timeoutMs: REFRESH_TIMEOUT_MS },
        });
      }

      const latestEligibility =
        refreshResult === TIMEOUT_SENTINEL || refreshResult === null
          ? eligibility
          : refreshResult;
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

  // 사용자가 셔터 버튼을 누르는 순간 녹화 시작 (long-press 패턴).
  // - 손을 떼면 onPressOut 에서 stopRecording 호출 → recordAsync 가 결과를 resolve
  // - 3초 (RECORD_DURATION_MS) 까지 누르고 있으면 자동 stop 안전망이 작동
  const handlePressIn = async () => {
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

    try {
      // max duration 안전망 — expo-camera 의 maxDuration 옵션이 작동하지 않거나 늦게 끊기는 케이스 대비
      stopTimerRef.current = setTimeout(() => {
        try {
          cameraRef.current?.stopRecording();
        } catch {
          // ignore — 이미 stop 된 상태일 수 있음
        }
        stopTimerRef.current = null;
      }, RECORD_DURATION_MS);

      const result = await cameraRef.current.recordAsync({
        maxDuration: RECORD_DURATION_MS / 1000,
      });

      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }

      stopAnimations();
      setIsRecording(false);

      if (result?.uri) {
        await navigateToResult(result.uri);
        return;
      }

      Alert.alert('촬영 실패', '촬영 파일을 만들지 못했어요. 다시 촬영해 주세요.');
    } catch (e) {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      logger.captureException(e, {
        tags: { feature: 'record', action: 'record-video' },
      });
      stopAnimations();
      setIsRecording(false);
      Alert.alert('촬영 실패', '촬영 파일을 저장하지 못했어요. 다시 촬영해 주세요.');
    }
  };

  // 손을 떼면 즉시 녹화 중단 → recordAsync 가 결과를 resolve 하면서 result 화면으로 전환된다.
  // 너무 빨리 떼서 file 이 비어 있는 케이스는 useSaveLog 의 size 검증에서 다시 잡힌다.
  const handlePressOut = () => {
    if (!isRecording) return;
    try {
      cameraRef.current?.stopRecording();
    } catch (e) {
      logger.captureException(e, {
        tags: { feature: 'record', action: 'stop-recording' },
      });
    }
  };

  // CameraView 렌더링은 카메라 권한만으로 충분. 마이크는 recordAsync 직전에 확인
  const isGranted = permission?.status === 'granted';
  const shouldMountCamera = isGranted && isFocused;

  return (
    <View className="flex-1 bg-[#1A1008]">
      {/* Camera — 포커스 상태일 때만 마운트. 백그라운드에서 AVSession 해제하여 result 화면 재생 가능하게 함 */}
      {/* flash 는 video 모드에서 torch 로만 동작 — UI 제거. selectedLens / onAvailableLensesChanged 는 native crash 이력으로 보류 */}
      {shouldMountCamera && (
        <CameraView
          // key 를 증가시켜 dialog dismiss 시 native AVCaptureSession 을 강제 재생성한다.
          key={cameraSessionKey}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          onMountError={(event) => {
            logger.captureException(new Error(event?.message ?? 'CameraView onMountError'), {
              tags: { feature: 'record', action: 'camera-mount' },
              extra: { facing, cameraSessionKey },
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

      {/* 닫기 버튼 (가로 모드 좌상단) */}
      <View
        pointerEvents="box-none"
        className="absolute"
        style={{
          top: insets.top + 12,
          left: insets.left + 20,
          zIndex: 1000,
        }}>
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
      </View>

      {/* 카메라 전환 버튼 (가로 모드 좌측 세로 중앙) */}
      <View
        className="absolute items-center"
        style={{
          left: insets.left + 20,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          zIndex: 100,
        }}>
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

      {/* 촬영 버튼 — 가로 모드에서 오른쪽 중앙 (오른손 엄지 위치). 꾹 누르고 있는 동안 녹화. */}
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

        {/* Shutter button — 꾹 누르고 있는 동안만 녹화 (long-press), 떼면 즉시 저장 */}
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={8}>
          {({ pressed }) => (
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 4,
                borderColor: 'white',
                backgroundColor: 'white',
                // 녹화 중(꾹 누름)에 시각적 피드백
                opacity: isRecording || pressed ? 0.3 : 1,
              }}
            />
          )}
        </Pressable>
      </View>

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

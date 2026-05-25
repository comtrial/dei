import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
// expo-screen-orientation@9.0.9 + iOS 26 에서 ScreenOrientationRegistry 의 main thread ↔
// internal queue 사이 양방향 sync dispatch deadlock 으로 5초 watchdog kill (0x8BADF00D).
// app.json 의 orientation="default" + Info.plist 4방향 허용으로 OS 자동 회전이 이미
// 가능하므로 강제 lockAsync 자체를 사용하지 않는다 (사용자가 폰을 가로로 들면 자동 회전).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import { useAuth } from '@/providers/auth-provider';

type CameraFacing = 'front' | 'back';

// 셔터 press-and-hold 의 **최대** 녹화 길이. 사용자가 손을 떼면 그 즉시 종료되며,
// 안 떼더라도 이 시간이 지나면 강제 종료되어 영상이 무한정 길어지지 않는다.
const RECORD_MAX_DURATION_MS = 2000;
const RING_SIZE = 92;

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const { user } = useAuth();
  const { hasClipToday, currentSlotLabel, isLoading: clipLoading } = useTodayClip(user?.id);

  const [isFocused, setIsFocused] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  // CameraView 의 key. iOS 에서 RN <Modal> 이 카메라 위에 덮이는 동안 AVCaptureSession
  // 이 suspend 되었다가 dismiss 후에도 자동 restart 되지 않는 케이스 방어 — dialog 닫힐
  // 때 key 증가로 CameraView 를 강제 unmount/remount.
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const didInitRef = useRef(false);

  // press-and-hold 셔터 — onPressOut 시점에 isRecording state 가 아직 commit
  // 안 된 race 를 피하기 위해 ref 로도 isRecording 을 추적한다.
  const isRecordingRef = useRef(false);
  // 실제 녹화 경과 시간 계산용 — recordAsync 시작 직전 timestamp.
  const recordStartMsRef = useRef<number>(0);
  // 녹화 stop/hang 타이머. press-and-hold 중 onPressOut 으로 stopRecording 을 호출하면
  // 이 타이머들은 더 이상 필요 없으므로 cleanup 한다.
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hangTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      isRecordingRef.current = false;
      setIsRecording(false);
      // CameraView 는 blur 시 언마운트되므로 re-mount 때 onCameraReady 가 다시
      // 발화한다. ready 를 false 로 초기화해야 stale ready=true 상태에서
      // 미초기화 AVSession 에 recordAsync 를 던져 hang 하는 것을 막는다.
      setIsCameraReady(false);
      // 카메라 화면 노출 — orientation 잠금은 사용하지 않는다 (위 import 주석 참조).
      // OS 자동 회전이 app.json/Info.plist 설정으로 이미 허용되어 있어 사용자가
      // 폰을 가로로 들면 자연스럽게 가로 모드로 표시된다.
      setIsFocused(true);
      return () => {
        setIsFocused(false); // 포커스 잃으면 CameraView 언마운트 → AVSession 해제
        didInitRef.current = false;
        setShowPermissionDialog(false);
        setShowOverwriteDialog(false);
        stopAnimations();
        // 녹화 도중 화면 이탈 시 stop/hang timer 가 dangling 되지 않도록 정리.
        if (stopTimerRef.current) {
          clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        if (hangTimerRef.current) {
          clearTimeout(hangTimerRef.current);
          hangTimerRef.current = null;
        }
        isRecordingRef.current = false;
        setIsRecording(false);
        setIsCameraReady(false);
      };
    }, [stopAnimations])
  );

  useFocusEffect(
    useCallback(() => {
      if (clipLoading || !permission || didInitRef.current) return;
      didInitRef.current = true;

      // result(검수) 의 "다시 촬영" 으로 돌아온 직후라면 1회성 ack 가 set 됨.
      // 사용자가 직전에 같은 dialog 를 confirm 한 의도를 존중해 중복 표시를 건너뛴다.
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

  // 카메라 전환 시 AVSession 이 재초기화되므로 ready 를 내려 onCameraReady 재발화를
  // 기다린다. 전환 직후 미초기화 세션에 recordAsync 던지는 것 방지.
  useEffect(() => {
    setIsCameraReady(false);
  }, [facing]);

  const startAnimations = () => {
    progressAnim.setValue(0);
    barAnim.setValue(0);

    // press-and-hold 의 최대 길이 기준으로 진행. 손을 일찍 떼면 stopAnimations() 로
    // 그 시점에서 멈춘다 (UI 가 마지막 진행도에서 자연스럽게 정지).
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: RECORD_MAX_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    Animated.timing(barAnim, {
      toValue: 1,
      duration: RECORD_MAX_DURATION_MS,
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
        // permission dialog 만 떴다 닫힌 경로 — Modal dismiss 후 카메라 session 강제 재생성
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
    (uri: string, recordedMs: number) => {
      setRecordingUri(uri);
      setIsFocused(false);
      setTimeout(() => {
        router.push({
          pathname: '/result',
          params: {
            durationMs: String(Math.round(recordedMs)),
          },
        });
      }, 600);
    },
    [router],
  );

  const cleanupRecordingTimers = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (hangTimerRef.current) {
      clearTimeout(hangTimerRef.current);
      hangTimerRef.current = null;
    }
  }, []);

  // 셔터 press-in: 누르는 순간 녹화 시작.
  // press-and-hold 정책 — 사용자가 손을 떼면(handleShutterPressOut) 그 즉시 종료되고,
  // 안 떼더라도 RECORD_MAX_DURATION_MS 후 자동 종료된다.
  const handleShutterPressIn = async () => {
    if (isRecordingRef.current) return;

    if (!cameraRef.current) {
      Alert.alert('촬영 준비 중', '카메라가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // onCameraReady 전에 recordAsync 를 호출하면 iOS 에서 Promise 가 resolve 되지
    // 않고 조용히 hang 한다 (expo-camera 문서: recordAsync 전 onCameraReady 대기 필수).
    if (!isCameraReady) {
      Alert.alert('촬영 준비 중', '카메라가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // 마이크 권한 — 미허용이면 다이얼로그 띄우고 이번 누름은 무시한다.
    // (press-and-hold 도중 권한 다이얼로그를 띄우는 건 UX 가 어색하므로 다음 누름에서
    //  정상 흐름으로 진입하도록 유도)
    if (micPermission?.status !== 'granted') {
      const micResult = await requestMicPermission();
      if (micResult.status !== 'granted') {
        Alert.alert('마이크 권한 필요', '로그 촬영을 위해 마이크 권한이 필요해요.');
      }
      return;
    }

    // 마이크 권한 체크 사이에 화면을 벗어났을 수 있다 — ref 재확인.
    const camera = cameraRef.current;
    if (!camera) return;

    clearRecordingUri();

    isRecordingRef.current = true;
    recordStartMsRef.current = Date.now();
    setIsRecording(true);
    startAnimations();

    let settled = false;

    try {
      // 최대 길이 boundary — 사용자가 손을 안 떼도 이 시간이 지나면 강제 종료.
      // (expo-camera 의 maxDuration 만으로는 native 가 stop 신호를 못 받는 케이스가
      //  있어 명시적 stopRecording 도 함께 건다.)
      stopTimerRef.current = setTimeout(() => {
        try {
          camera.stopRecording();
        } catch {
          // no-op
        }
      }, RECORD_MAX_DURATION_MS);

      // 안전망: recordAsync 가 어떤 이유로든 resolve/reject 되지 않으면
      // (조용한 hang) UI 가 isRecording 에 영구히 갇히지 않게 강제 복구한다.
      const hangGuard = new Promise<never>((_, reject) => {
        hangTimerRef.current = setTimeout(() => {
          try {
            camera.stopRecording();
          } catch {
            // no-op
          }
          reject(new Error('recordAsync timed out (silent hang guard)'));
        }, RECORD_MAX_DURATION_MS + 5000);
      });

      const result = await Promise.race([
        camera.recordAsync({ maxDuration: RECORD_MAX_DURATION_MS / 1000 }),
        hangGuard,
      ]);

      settled = true;
      cleanupRecordingTimers();
      stopAnimations();
      isRecordingRef.current = false;
      setIsRecording(false);

      if (result?.uri) {
        // 실제 녹화 경과 시간 (손 뗀 시점 또는 max 도달 시점) 을 result 로 전달.
        // 0 ≤ elapsed ≤ RECORD_MAX_DURATION_MS 로 clamp.
        const elapsedMs = Math.min(
          Math.max(Date.now() - recordStartMsRef.current, 0),
          RECORD_MAX_DURATION_MS,
        );
        navigateToResult(result.uri, elapsedMs);
        return;
      }

      Alert.alert('촬영 실패', '촬영 파일을 만들지 못했어요. 다시 촬영해 주세요.');
    } catch (e) {
      cleanupRecordingTimers();
      logger.captureException(e, {
        tags: { feature: 'record', action: 'record-video' },
        extra: { settled, isCameraReady, facing },
      });
      stopAnimations();
      isRecordingRef.current = false;
      setIsRecording(false);
      Alert.alert('촬영 실패', '촬영 파일을 저장하지 못했어요. 다시 촬영해 주세요.');
    }
  };

  // 셔터 press-out: 손을 떼는 순간 녹화 종료.
  // stopRecording 만 호출하면 recordAsync 가 resolve 되고 그 시점의 경과 시간으로
  // navigateToResult 로 이어진다 (cleanup 은 위 try 블록의 정상 경로에서 수행).
  const handleShutterPressOut = () => {
    if (!isRecordingRef.current) return;
    const camera = cameraRef.current;
    if (!camera) return;
    try {
      camera.stopRecording();
    } catch (err) {
      logger.captureException(err, {
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
          // key 증가 시 native AVCaptureSession 을 강제 재생성한다 (Modal dismiss stuck 대응).
          key={cameraSessionKey}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={(event) => {
            setIsCameraReady(false);
            logger.captureException(new Error(event?.message ?? 'CameraView onMountError'), {
              tags: { feature: 'record', action: 'camera-mount' },
              extra: { facing, cameraSessionKey },
            });
            Alert.alert('카메라 오류', '카메라를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
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

            // orientation 잠금/해제 호출은 deadlock 회피를 위해 사용하지 않는다 (위 import 주석 참조).
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

      {/* 촬영 버튼 — 가로 모드에서 오른쪽 중앙 (오른손 엄지 위치).
         press-and-hold: 누르고 있는 동안 녹화, 손 떼면 즉시 종료. */}
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

        {/* Shutter button — press-and-hold.
           카메라 미준비 시에만 disabled (녹화 중에는 onPressOut 받아야 하므로 disabled 금지). */}
        <TouchableOpacity
          onPressIn={handleShutterPressIn}
          onPressOut={handleShutterPressOut}
          activeOpacity={0.8}
          hitSlop={8}
          disabled={!isCameraReady}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              borderWidth: 4,
              borderColor: 'white',
              backgroundColor: 'white',
              opacity: isRecording ? 0.6 : !isCameraReady ? 0.3 : 1,
            }}
          />
        </TouchableOpacity>
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
